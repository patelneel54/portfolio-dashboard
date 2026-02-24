import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from database import init_db, get_db
from auth import verify_pin, create_token, require_auth
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
)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    scheduler.add_job(
        refresh_all_prices,
        "cron",
        hour=int(os.getenv("REFRESH_HOUR", "16")),
        minute=int(os.getenv("REFRESH_MINUTE", "30")),
        timezone="US/Eastern",
        id="daily_refresh",
        replace_existing=True,
    )
    scheduler.start()
    # Refresh prices on startup
    asyncio.create_task(refresh_all_prices())
    yield
    scheduler.shutdown()


app = FastAPI(title="Portfolio Dashboard API", lifespan=lifespan)

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


class HoldingUpdate(BaseModel):
    shares: float | None = None
    avg_cost: float | None = None
    target_allocation: float | None = None
    purchase_date: str | None = None


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


# ── Auth Routes ──


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    if not verify_pin(req.pin):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    token = create_token()
    return {"token": token}


@app.get("/api/auth/check")
async def check_auth(_=Depends(require_auth)):
    return {"status": "ok"}


# ── Holdings Routes ──


@app.get("/api/holdings")
async def list_holdings(_=Depends(require_auth)):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM holdings ORDER BY id")
        rows = await cursor.fetchall()

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
    }


@app.post("/api/holdings")
async def add_holding(
    holding: HoldingCreate,
    background_tasks: BackgroundTasks,
    _=Depends(require_auth),
):
    ticker = holding.ticker.upper().strip()

    # Validate ticker
    info = await validate_ticker(ticker)
    if info is None:
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {ticker}")

    async with get_db() as db:
        # Check for duplicate
        cursor = await db.execute(
            "SELECT id FROM holdings WHERE ticker = ?", (ticker,)
        )
        if await cursor.fetchone():
            raise HTTPException(status_code=409, detail=f"{ticker} already exists")

        await db.execute(
            """INSERT INTO holdings (ticker, type, shares, avg_cost, target_allocation, purchase_date, current_price, previous_close, last_updated)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                ticker,
                info["type"],
                holding.shares,
                holding.avg_cost,
                holding.target_allocation,
                holding.purchase_date,
                info["price"],
                info["previous_close"],
            ),
        )
        await db.commit()

    # Fetch price history in background
    background_tasks.add_task(fetch_price_history, ticker)

    return {"status": "ok", "ticker": ticker, "type": info["type"]}


@app.put("/api/holdings/{holding_id}")
async def update_holding(
    holding_id: int, update: HoldingUpdate, _=Depends(require_auth)
):
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM holdings WHERE id = ?", (holding_id,))
        if not await cursor.fetchone():
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

        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [holding_id]
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
        await db.execute("DELETE FROM price_history WHERE ticker = ?", (ticker,))
        await db.commit()

    return {"status": "ok"}


@app.post("/api/holdings/refresh-prices")
async def manual_refresh(_=Depends(require_auth)):
    await refresh_all_prices()
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


# ── Performance Route ──


@app.get("/api/performance")
async def performance_endpoint(_=Depends(require_auth)):
    """Return daily historical portfolio values and S&P 500 benchmark."""
    try:
        return await get_portfolio_performance()
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
async def portfolio_intelligence_endpoint(_=Depends(require_auth)):
    """Return sector exposure and dividend profile for the portfolio."""
    try:
        return await get_portfolio_intelligence()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Portfolio intelligence unavailable: {e}",
        )


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
