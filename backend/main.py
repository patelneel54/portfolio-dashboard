import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from database import init_db, get_db
from auth import verify_pin, verify_pin_async, create_token, require_auth, update_pin_hash
from webauthn_routes import (
    webauthn_register_options,
    webauthn_register_verify,
    webauthn_auth_options,
    webauthn_auth_verify,
    webauthn_delete_credential,
    webauthn_get_status,
)
from stock_service import (
    refresh_all_prices,
    fetch_price_history,
    get_technicals,
    get_price_history,
    get_portfolio_performance,
    validate_ticker,
    get_news,
    get_fundamentals,
    get_portfolio_intelligence,
    get_portfolio_analytics,
    get_fear_greed,
    get_crypto_global,
    get_dividend_calendar,
    get_dividend_history,
    get_bond_metrics,
    get_rebalance_suggestions,
)
from fidelity_csv import parse_fidelity_csv

VALID_ACCOUNT_TYPES = ("brokerage", "401k", "crypto")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")

scheduler = AsyncIOScheduler()


async def check_alerts():
    """Check all untriggered alerts against current prices and drift."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM alerts WHERE triggered = 0")
        alerts = [dict(r) for r in await cursor.fetchall()]
        if not alerts:
            return

        h_cursor = await db.execute("SELECT * FROM holdings")
        holdings = [dict(r) for r in await h_cursor.fetchall()]

    total_value = sum(
        h["shares"] * (h["current_price"] or h["avg_cost"]) for h in holdings
    )
    holdings_by_ticker = {h["ticker"]: h for h in holdings}

    triggered_ids = []
    for alert in alerts:
        if alert["alert_type"] in ("price_below", "price_above"):
            h = holdings_by_ticker.get(alert["ticker"])
            if h and h["current_price"]:
                if alert["alert_type"] == "price_below" and h["current_price"] <= alert["threshold"]:
                    triggered_ids.append(alert["id"])
                elif alert["alert_type"] == "price_above" and h["current_price"] >= alert["threshold"]:
                    triggered_ids.append(alert["id"])
        elif alert["alert_type"] == "drift_above" and total_value > 0:
            for h in holdings:
                if h["current_price"]:
                    actual = (h["shares"] * h["current_price"] / total_value) * 100
                    drift = abs(actual - h["target_allocation"])
                    if drift >= alert["threshold"]:
                        triggered_ids.append(alert["id"])
                        break

    if triggered_ids:
        async with get_db() as db:
            for aid in triggered_ids:
                await db.execute(
                    "UPDATE alerts SET triggered = 1, triggered_at = datetime('now') WHERE id = ?",
                    (aid,),
                )
            await db.commit()

        # Send push notification for triggered alerts
        triggered_alerts = [a for a in alerts if a["id"] in triggered_ids]
        descriptions = []
        for a in triggered_alerts:
            if a["alert_type"] == "price_below":
                h = holdings_by_ticker.get(a["ticker"])
                price_str = f"${h['current_price']:.2f}" if h and h["current_price"] else ""
                descriptions.append(f"{a['ticker']} dropped below ${a['threshold']:.2f} {price_str}")
            elif a["alert_type"] == "price_above":
                h = holdings_by_ticker.get(a["ticker"])
                price_str = f"${h['current_price']:.2f}" if h and h["current_price"] else ""
                descriptions.append(f"{a['ticker']} rose above ${a['threshold']:.2f} {price_str}")
            elif a["alert_type"] == "drift_above":
                descriptions.append(f"Portfolio drift exceeded {a['threshold']:.1f}%")

        body = " | ".join(descriptions[:3])
        if len(descriptions) > 3:
            body += f" (+{len(descriptions) - 3} more)"
        try:
            await send_push_notifications(
                f"{len(triggered_ids)} Alert{'s' if len(triggered_ids) > 1 else ''} Triggered",
                body,
                "/",
            )
        except Exception:
            pass  # Don't let push failures affect alert processing


async def daily_refresh_and_check():
    """Refresh prices then check alerts."""
    await refresh_all_prices()
    await check_alerts()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    scheduler.add_job(
        daily_refresh_and_check,
        "cron",
        hour=int(os.getenv("REFRESH_HOUR", "16")),
        minute=int(os.getenv("REFRESH_MINUTE", "30")),
        timezone="US/Eastern",
        id="daily_refresh",
        replace_existing=True,
    )
    scheduler.start()
    # Refresh prices on startup
    asyncio.create_task(daily_refresh_and_check())
    yield
    scheduler.shutdown()


app = FastAPI(title="Portfolio Command Center API", lifespan=lifespan)

# CORS for dev (Vite proxy handles most cases, this is a fallback)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Models ──


class LoginRequest(BaseModel):
    pin: str


class HoldingCreate(BaseModel):
    ticker: str
    shares: float
    avg_cost: float
    target_allocation: float = 0
    purchase_date: str | None = None
    account_type: str = "brokerage"
    is_manual: bool = False
    manual_name: str | None = None
    asset_class: str | None = None
    current_price: float | None = None
    benchmark_ticker: str | None = None


class HoldingUpdate(BaseModel):
    shares: float | None = None
    avg_cost: float | None = None
    target_allocation: float | None = None
    purchase_date: str | None = None
    account_type: str | None = None
    asset_class: str | None = None
    current_price: float | None = None
    manual_name: str | None = None
    benchmark_ticker: str | None = None


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


class AlertCreate(BaseModel):
    ticker: str
    alert_type: str
    threshold: float


class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class WebAuthnCredential(BaseModel):
    credential: dict


# ── Auth Routes ──


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    if not await verify_pin_async(req.pin):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    token = create_token()
    return {"token": token}


@app.get("/api/auth/check")
async def check_auth(_=Depends(require_auth)):
    return {"status": "ok"}


@app.post("/api/auth/change-pin")
async def change_pin(req: ChangePinRequest, _=Depends(require_auth)):
    """Change the user's PIN. Verifies current PIN first."""
    if len(req.new_pin) < 4:
        raise HTTPException(status_code=400, detail="New PIN must be at least 4 characters")
    if not await verify_pin_async(req.current_pin):
        raise HTTPException(status_code=401, detail="Current PIN is incorrect")
    await update_pin_hash(req.new_pin)
    return {"status": "ok"}


# ── WebAuthn Routes ──


@app.post("/api/webauthn/register-options")
async def wa_register_options(_=Depends(require_auth)):
    return await webauthn_register_options()


@app.post("/api/webauthn/register-verify")
async def wa_register_verify(body: WebAuthnCredential, _=Depends(require_auth)):
    return await webauthn_register_verify(body.model_dump())


@app.post("/api/webauthn/auth-options")
async def wa_auth_options():
    return await webauthn_auth_options()


@app.post("/api/webauthn/auth-verify")
async def wa_auth_verify(body: WebAuthnCredential):
    return await webauthn_auth_verify(body.model_dump())


@app.delete("/api/webauthn/credential")
async def wa_delete(_=Depends(require_auth)):
    return await webauthn_delete_credential()


@app.get("/api/webauthn/status")
async def wa_status(_=Depends(require_auth)):
    return await webauthn_get_status()


# ── Holdings Routes ──


@app.get("/api/holdings")
async def list_holdings(_=Depends(require_auth)):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM holdings ORDER BY id")
        rows = await cursor.fetchall()
        lr_cursor = await db.execute("SELECT MAX(last_updated) as lr FROM holdings")
        lr_row = await lr_cursor.fetchone()
        last_refreshed = lr_row["lr"] if lr_row else None

    holdings = [dict(r) for r in rows]
    total_value = sum(
        h["shares"] * (h["current_price"] or h["avg_cost"]) for h in holdings
    )
    total_cost = sum(h["shares"] * h["avg_cost"] for h in holdings)

    for h in holdings:
        price = h["current_price"] or h["avg_cost"]
        market_value = h["shares"] * price
        cost_basis = h["shares"] * h["avg_cost"]
        h["market_value"] = round(market_value, 2)
        h["cost_basis"] = round(cost_basis, 2)
        h["gain_loss"] = round(market_value - cost_basis, 2)
        h["gain_loss_pct"] = (
            round(((price - h["avg_cost"]) / h["avg_cost"]) * 100, 2)
            if h["avg_cost"]
            else 0
        )
        h["actual_allocation"] = (
            round((market_value / total_value) * 100, 2) if total_value else 0
        )
        h["drift"] = round(h["actual_allocation"] - h["target_allocation"], 2)
        if h["current_price"] and h["previous_close"]:
            h["day_change_pct"] = round(
                ((h["current_price"] - h["previous_close"]) / h["previous_close"])
                * 100,
                2,
            )
        else:
            h["day_change_pct"] = 0

    return {
        "holdings": holdings,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_gain_loss": round(total_value - total_cost, 2),
        "total_gain_loss_pct": (
            round(((total_value - total_cost) / total_cost) * 100, 2)
            if total_cost
            else 0
        ),
        "last_refreshed": last_refreshed,
    }


@app.post("/api/holdings")
async def add_holding(
    holding: HoldingCreate,
    background_tasks: BackgroundTasks,
    _=Depends(require_auth),
):
    ticker = holding.ticker.upper().strip()

    # Validate account_type
    if holding.account_type not in VALID_ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail=f"account_type must be one of {VALID_ACCOUNT_TYPES}")

    if holding.is_manual:
        # Manual holding: skip yfinance validation, require current_price
        if holding.current_price is None:
            raise HTTPException(status_code=400, detail="current_price is required for manual holdings")
        # Validate benchmark_ticker if provided
        if holding.benchmark_ticker:
            bench_info = await validate_ticker(holding.benchmark_ticker.upper().strip())
            if bench_info is None:
                raise HTTPException(status_code=400, detail=f"Invalid benchmark ticker: {holding.benchmark_ticker}")
        info = {
            "price": holding.current_price,
            "previous_close": holding.current_price,
            "type": "Fund",
        }
    else:
        # For crypto, normalize ticker to yfinance format (e.g. BTC -> BTC-USD)
        if holding.account_type == "crypto" and not ticker.endswith("-USD"):
            ticker = f"{ticker}-USD"

        # Validate ticker
        info = await validate_ticker(ticker)
        if info is None:
            raise HTTPException(status_code=400, detail=f"Invalid ticker: {ticker}")

        # Override type for crypto
        if holding.account_type == "crypto":
            info["type"] = "Crypto"

    async with get_db() as db:
        # Check for duplicate (same ticker + same account)
        cursor = await db.execute(
            "SELECT id FROM holdings WHERE ticker = ? AND account_type = ?",
            (ticker, holding.account_type),
        )
        if await cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail=f"{ticker} already exists in {holding.account_type}",
            )

        await db.execute(
            """INSERT INTO holdings (ticker, type, shares, avg_cost, target_allocation,
               purchase_date, account_type, current_price, previous_close, last_updated,
               is_manual, manual_name, asset_class, benchmark_ticker)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)""",
            (
                ticker,
                info["type"],
                holding.shares,
                holding.avg_cost,
                holding.target_allocation,
                holding.purchase_date,
                holding.account_type,
                info["price"],
                info["previous_close"],
                1 if holding.is_manual else 0,
                holding.manual_name,
                holding.asset_class,
                holding.benchmark_ticker.upper().strip() if holding.benchmark_ticker else None,
            ),
        )
        await db.commit()

    # Fetch price history in background (skip for manual holdings)
    if not holding.is_manual:
        background_tasks.add_task(fetch_price_history, ticker)

    return {"status": "ok", "ticker": ticker, "type": info["type"]}


@app.put("/api/holdings/{holding_id}")
async def update_holding(
    holding_id: int, update: HoldingUpdate, _=Depends(require_auth)
):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,))
        existing = await cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Holding not found")

        updates = {}
        if update.shares is not None:
            updates["shares"] = update.shares
        if update.avg_cost is not None:
            updates["avg_cost"] = update.avg_cost
        if update.target_allocation is not None:
            updates["target_allocation"] = update.target_allocation
        if update.purchase_date is not None:
            updates["purchase_date"] = update.purchase_date
        if update.asset_class is not None:
            updates["asset_class"] = update.asset_class
        if update.manual_name is not None:
            updates["manual_name"] = update.manual_name
        if update.benchmark_ticker is not None:
            bt = update.benchmark_ticker.upper().strip() if update.benchmark_ticker else None
            if bt:
                bench_info = await validate_ticker(bt)
                if bench_info is None:
                    raise HTTPException(status_code=400, detail=f"Invalid benchmark ticker: {bt}")
            updates["benchmark_ticker"] = bt
        if update.current_price is not None:
            # Set previous_close to old price before updating
            updates["previous_close"] = existing["current_price"] or update.current_price
            updates["current_price"] = update.current_price
            updates["last_updated"] = "datetime_now"  # placeholder handled below
        if update.account_type is not None:
            if update.account_type not in VALID_ACCOUNT_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"account_type must be one of {VALID_ACCOUNT_TYPES}",
                )
            # Check for duplicate when changing account_type
            dup = await db.execute(
                "SELECT id FROM holdings WHERE ticker = ? AND account_type = ? AND id != ?",
                (existing["ticker"], update.account_type, holding_id),
            )
            if await dup.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"{existing['ticker']} already exists in {update.account_type}",
                )
            updates["account_type"] = update.account_type

        if updates:
            # Handle datetime('now') for last_updated
            has_datetime = updates.pop("last_updated", None)
            set_parts = [f"{k} = ?" for k in updates]
            values = list(updates.values())
            if has_datetime:
                set_parts.append("last_updated = datetime('now')")
            set_clause = ", ".join(set_parts)
            values.append(holding_id)
            await db.execute(
                f"UPDATE holdings SET {set_clause} WHERE id = ?", values
            )
            await db.commit()

    return {"status": "ok"}


@app.delete("/api/holdings/{holding_id}")
async def delete_holding(holding_id: int, _=Depends(require_auth)):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT ticker FROM holdings WHERE id = ?", (holding_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Holding not found")

        ticker = row["ticker"]
        await db.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
        # Only delete price_history if no other holdings reference this ticker
        remaining = await db.execute(
            "SELECT COUNT(*) as cnt FROM holdings WHERE ticker = ?", (ticker,)
        )
        if (await remaining.fetchone())["cnt"] == 0:
            await db.execute(
                "DELETE FROM price_history WHERE ticker = ?", (ticker,)
            )
            await db.execute(
                "DELETE FROM alerts WHERE ticker = ?", (ticker,)
            )
        await db.commit()

    return {"status": "ok"}


@app.post("/api/holdings/refresh-prices")
async def manual_refresh(_=Depends(require_auth)):
    await refresh_all_prices()
    await check_alerts()
    return {"status": "ok"}


# ── Settings Routes ──


@app.get("/api/settings")
async def get_settings(_=Depends(require_auth)):
    async with get_db() as db:
        cursor = await db.execute("SELECT key, value FROM settings")
        rows = await cursor.fetchall()
    return {r["key"]: r["value"] for r in rows}


@app.put("/api/settings")
async def update_settings(body: SettingsUpdate, _=Depends(require_auth)):
    async with get_db() as db:
        for key, value in body.settings.items():
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, str(value)),
            )
        await db.commit()
    return {"status": "ok"}


# ── Export Route ──


@app.get("/api/export")
async def export_data(format: str = Query("csv", pattern="^(csv|json)$"), _=Depends(require_auth)):
    """Export all holdings as CSV or JSON."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM holdings ORDER BY account_type, ticker")
        rows = [dict(r) for r in await cursor.fetchall()]

    # Calculate market_value and gain_loss for each row
    for h in rows:
        price = h["current_price"] or h["avg_cost"]
        h["market_value"] = round(h["shares"] * price, 2)
        h["gain_loss"] = round(h["market_value"] - h["shares"] * h["avg_cost"], 2)

    if format == "json":
        import json
        content = json.dumps(rows, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=portfolio.json"},
        )

    # CSV format
    import csv
    import io
    columns = [
        "ticker", "type", "shares", "avg_cost", "current_price", "market_value",
        "gain_loss", "account_type", "asset_class", "purchase_date", "manual_name",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=portfolio.csv"},
    )


# ── Cache Clear Route ──


@app.post("/api/cache/clear")
async def clear_cache(_=Depends(require_auth)):
    """Delete all cached price history and reset current prices."""
    async with get_db() as db:
        await db.execute("DELETE FROM price_history")
        await db.execute(
            "UPDATE holdings SET current_price = NULL, previous_close = NULL, last_updated = NULL"
        )
        await db.commit()
    return {"status": "ok", "message": "Price cache cleared. Refresh prices to re-fetch."}


# ── Data Reset Route ──


@app.delete("/api/data/reset")
async def reset_all_data(_=Depends(require_auth)):
    """Delete all holdings, price history, and alerts. Reset settings to defaults."""
    from database import DEFAULT_SETTINGS
    async with get_db() as db:
        await db.execute("DELETE FROM holdings")
        await db.execute("DELETE FROM price_history")
        await db.execute("DELETE FROM alerts")
        # Reset settings but keep auth_pin_hash
        cursor = await db.execute(
            "SELECT value FROM settings WHERE key = 'auth_pin_hash'"
        )
        pin_row = await cursor.fetchone()
        await db.execute("DELETE FROM settings")
        for key, value in DEFAULT_SETTINGS.items():
            await db.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)", (key, value)
            )
        if pin_row:
            await db.execute(
                "INSERT INTO settings (key, value) VALUES ('auth_pin_hash', ?)",
                (pin_row["value"],),
            )
        await db.commit()
    return {"status": "ok"}


# ── Alert Routes ──

VALID_ALERT_TYPES = ("price_below", "price_above", "drift_above")


@app.post("/api/alerts")
async def create_alert(alert: AlertCreate, _=Depends(require_auth)):
    if alert.alert_type not in VALID_ALERT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"alert_type must be one of {VALID_ALERT_TYPES}",
        )
    if alert.threshold <= 0:
        raise HTTPException(status_code=400, detail="threshold must be positive")

    ticker = alert.ticker.upper().strip()

    # For price alerts, verify the ticker exists in holdings
    if alert.alert_type != "drift_above":
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT id FROM holdings WHERE ticker = ?", (ticker,)
            )
            if not await cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail=f"No holding found for ticker {ticker}",
                )

    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO alerts (ticker, alert_type, threshold) VALUES (?, ?, ?)",
            (ticker, alert.alert_type, alert.threshold),
        )
        alert_id = cursor.lastrowid
        await db.commit()

    return {"status": "ok", "id": alert_id}


@app.get("/api/alerts")
async def list_alerts(triggered: bool | None = None, _=Depends(require_auth)):
    async with get_db() as db:
        if triggered is not None:
            cursor = await db.execute(
                "SELECT * FROM alerts WHERE triggered = ? ORDER BY created_at DESC",
                (1 if triggered else 0,),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM alerts ORDER BY created_at DESC"
            )
        rows = await cursor.fetchall()

    return [
        {**dict(r), "triggered": bool(r["triggered"])}
        for r in rows
    ]


@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: int, _=Depends(require_auth)):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM alerts WHERE id = ?", (alert_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Alert not found")
        await db.execute("DELETE FROM alerts WHERE id = ?", (alert_id,))
        await db.commit()
    return {"status": "ok"}


@app.patch("/api/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: int, _=Depends(require_auth)):
    async with get_db() as db:
        await db.execute(
            "UPDATE alerts SET triggered = 0, triggered_at = NULL WHERE id = ?",
            (alert_id,),
        )
        await db.commit()
    return {"status": "ok"}


# ── Fidelity CSV Import Route ──


@app.post("/api/import/fidelity-csv")
async def import_fidelity_csv(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    _=Depends(require_auth),
):
    """Import holdings from a Fidelity 401k CSV export."""
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    parsed = parse_fidelity_csv(text)
    if not parsed:
        raise HTTPException(status_code=400, detail="No holdings found in CSV. Check file format.")

    added = 0
    updated = 0
    errors = []

    for entry in parsed:
        ticker = entry["ticker"]
        try:
            async with get_db() as db:
                cursor = await db.execute(
                    "SELECT id, current_price FROM holdings WHERE ticker = ? AND account_type = '401k'",
                    (ticker,),
                )
                existing = await cursor.fetchone()

                if existing:
                    # Update existing holding
                    await db.execute(
                        """UPDATE holdings SET shares = ?, avg_cost = ?, current_price = ?,
                           previous_close = ?, last_updated = datetime('now'),
                           asset_class = ?, manual_name = ?, is_manual = ?, benchmark_ticker = ?
                           WHERE id = ?""",
                        (
                            entry["shares"], entry["avg_cost"], entry["current_price"],
                            existing["current_price"] or entry["current_price"],
                            entry["asset_class"], entry.get("manual_name"),
                            1 if entry["is_manual"] else 0, entry.get("benchmark_ticker"),
                            existing["id"],
                        ),
                    )
                    updated += 1
                else:
                    # Insert new holding
                    await db.execute(
                        """INSERT INTO holdings (ticker, type, shares, avg_cost, target_allocation,
                           account_type, current_price, previous_close, last_updated,
                           is_manual, manual_name, asset_class, benchmark_ticker)
                           VALUES (?, ?, ?, ?, 0, '401k', ?, ?, datetime('now'), ?, ?, ?, ?)""",
                        (
                            ticker, entry.get("type", "Fund"), entry["shares"],
                            entry["avg_cost"], entry["current_price"], entry["current_price"],
                            1 if entry["is_manual"] else 0, entry.get("manual_name"),
                            entry["asset_class"], entry.get("benchmark_ticker"),
                        ),
                    )
                    added += 1
                    # Fetch price history for non-manual holdings
                    if not entry["is_manual"] and background_tasks:
                        background_tasks.add_task(fetch_price_history, ticker)

                await db.commit()
        except Exception as e:
            errors.append({"ticker": ticker, "error": str(e)})

    return {"added": added, "updated": updated, "errors": errors}


# ── Bond Metrics Route ──


@app.get("/api/bond-metrics/{ticker}")
async def bond_metrics_endpoint(ticker: str, _=Depends(require_auth)):
    """Return bond-specific metrics for a fund."""
    ticker = ticker.upper().strip()
    data = await get_bond_metrics(ticker)
    return data


# ── Rebalance Suggestions Route ──


@app.get("/api/rebalance-suggestions")
async def rebalance_suggestions_endpoint(
    account_type: str | None = None, _=Depends(require_auth)
):
    """Return smart rebalancing suggestions based on asset class allocation and age."""
    try:
        return await get_rebalance_suggestions(account_type=account_type)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Rebalance suggestions unavailable: {e}",
        )


# ── Performance Route ──


@app.get("/api/performance")
async def performance_endpoint(account_type: str | None = None, _=Depends(require_auth)):
    """Return daily historical portfolio values and S&P 500 benchmark."""
    try:
        return await get_portfolio_performance(account_type=account_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance data unavailable: {e}")


# ── Technicals Route ──


@app.get("/api/technicals/{ticker}")
async def technicals_endpoint(ticker: str, _=Depends(require_auth)):
    ticker = ticker.upper().strip()
    data = await get_technicals(ticker)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"No technical data for {ticker}. Price history may still be loading.",
        )
    return data


@app.get("/api/price-history/{ticker}")
async def price_history_endpoint(ticker: str, period: str = "3m", _=Depends(require_auth)):
    ticker = ticker.upper().strip()
    data = await get_price_history(ticker, period)
    return data


# ── News Route ──


@app.get("/api/news/{ticker}")
async def news_endpoint(ticker: str, _=Depends(require_auth)):
    ticker = ticker.upper().strip()
    return await get_news(ticker)


# ── Fundamentals Route ──


@app.get("/api/fundamentals/{ticker}")
async def fundamentals_endpoint(ticker: str, _=Depends(require_auth)):
    ticker = ticker.upper().strip()
    return await get_fundamentals(ticker)


# ── Portfolio Intelligence Route ──


@app.get("/api/portfolio-intelligence")
async def portfolio_intelligence_endpoint(account_type: str | None = None, _=Depends(require_auth)):
    """Return sector exposure and dividend profile for the portfolio."""
    try:
        return await get_portfolio_intelligence(account_type=account_type)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Portfolio intelligence unavailable: {e}",
        )


# ── Dividend Calendar Route ──


@app.get("/api/dividend-calendar")
async def dividend_calendar_endpoint(
    month: str, account_type: str | None = None, _=Depends(require_auth)
):
    """Return dividend events for a given month."""
    try:
        return await get_dividend_calendar(month=month, account_type=account_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Dividend calendar unavailable: {e}"
        )


# ── Dividend History Route ──


@app.get("/api/dividend-history")
async def dividend_history_endpoint(
    months: int = 12, account_type: str | None = None, _=Depends(require_auth)
):
    """Return monthly dividend income totals for the last N months."""
    try:
        return await get_dividend_history(months=months, account_type=account_type)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Dividend history unavailable: {e}"
        )


# ── Portfolio Analytics Route ──


@app.get("/api/portfolio-analytics")
async def portfolio_analytics_endpoint(account_type: str | None = None, _=Depends(require_auth)):
    """Return enriched analytics for 3-level drill-down views."""
    try:
        return await get_portfolio_analytics(account_type=account_type)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Portfolio analytics unavailable: {e}",
        )


# ── Crypto Market Data Routes ──


@app.get("/api/crypto/fear-greed")
async def fear_greed_endpoint(_=Depends(require_auth)):
    """Return Fear & Greed Index (current + 30-day history)."""
    try:
        return await get_fear_greed()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fear & Greed data unavailable: {e}")


@app.get("/api/crypto/global")
async def crypto_global_endpoint(_=Depends(require_auth)):
    """Return global crypto market data (BTC dominance, total market cap, etc.)."""
    try:
        return await get_crypto_global()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Global crypto data unavailable: {e}")


# ── Push Notification Routes ──


async def send_push_notifications(title: str, body: str, url: str = "/"):
    """Send push notifications to all registered subscriptions."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return  # Push not configured

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return  # pywebpush not installed

    async with get_db() as db:
        cursor = await db.execute("SELECT endpoint, p256dh, auth FROM push_subscriptions")
        subs = [dict(r) for r in await cursor.fetchall()]

    if not subs:
        return

    import json
    payload = json.dumps({"title": title, "body": body, "url": url})
    stale_endpoints = []

    for sub in subs:
        sub_info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": "mailto:portfolio@localhost"},
            )
        except Exception:
            # Subscription may have expired — mark for cleanup
            stale_endpoints.append(sub["endpoint"])

    # Clean up stale subscriptions
    if stale_endpoints:
        async with get_db() as db:
            for ep in stale_endpoints:
                await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (ep,))
            await db.commit()


@app.get("/api/push/vapid-key")
async def get_vapid_key(_=Depends(require_auth)):
    """Return the VAPID public key for push subscription."""
    return {"publicKey": VAPID_PUBLIC_KEY}


@app.post("/api/push/subscribe")
async def push_subscribe(sub: PushSubscription, _=Depends(require_auth)):
    """Register a push notification subscription."""
    async with get_db() as db:
        await db.execute(
            """INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth)
               VALUES (?, ?, ?)""",
            (sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", "")),
        )
        await db.commit()
    return {"status": "ok"}


@app.delete("/api/push/unsubscribe")
async def push_unsubscribe(sub: PushSubscription, _=Depends(require_auth)):
    """Remove a push notification subscription."""
    async with get_db() as db:
        await db.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = ?",
            (sub.endpoint,),
        )
        await db.commit()
    return {"status": "ok"}


@app.post("/api/push/test")
async def push_test(_=Depends(require_auth)):
    """Send a test push notification."""
    await send_push_notifications(
        "Portfolio Command Center",
        "Push notifications are working! You'll be notified when alerts trigger.",
        "/",
    )
    return {"status": "ok"}


# ── Static File Serving (production) ──

FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIR.exists():
    # Serve static assets (JS, CSS, images, etc.)
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIR / "assets"),
        name="static-assets",
    )

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        # Try to serve the exact file first (manifest.json, icons, sw.js, etc.)
        file_path = FRONTEND_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Fall back to index.html for client-side routing
        return FileResponse(FRONTEND_DIR / "index.html")
