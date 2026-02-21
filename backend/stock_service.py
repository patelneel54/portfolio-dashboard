import asyncio
import time
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
from database import get_db

# ETF tickers for auto-classification
KNOWN_ETFS = {
    "VOO", "VTI", "QQQ", "SCHD", "VNQ", "AVUV", "SPY", "IWM", "VEA", "VWO",
    "BND", "VXUS", "VIG", "SCHB", "SCHA", "SCHF", "SCHE", "VGT", "XLF", "XLE",
    "XLK", "XLV", "XLY", "XLP", "XLI", "XLU", "XLRE", "XLC", "XLB",
    "ARKK", "ARKW", "ARKG", "ARKF", "ARKQ", "JEPI", "JEPQ", "DIVO",
}


def classify_ticker(ticker: str) -> str:
    """Classify a ticker as ETF or Stock."""
    if ticker.upper() in KNOWN_ETFS:
        return "ETF"
    try:
        t = yf.Ticker(ticker)
        info = t.info
        qt = info.get("quoteType", "")
        if qt == "ETF":
            return "ETF"
    except Exception:
        pass
    return "Stock"


async def validate_ticker(ticker: str) -> dict | None:
    """Validate a ticker exists and return basic info. Returns None if invalid."""
    def _validate(t):
        try:
            obj = yf.Ticker(t)
            fi = obj.fast_info
            price = fi.last_price
            if price is None or price <= 0:
                return None
            return {
                "price": float(price),
                "previous_close": float(fi.previous_close) if fi.previous_close else float(price),
                "type": classify_ticker(t),
            }
        except Exception:
            return None
    return await asyncio.to_thread(_validate, ticker)


async def refresh_all_prices():
    """Fetch current prices for all holdings and update price history."""
    async with get_db() as db:
        cursor = await db.execute("SELECT ticker FROM holdings")
        rows = await cursor.fetchall()
        tickers = [r["ticker"] for r in rows]

    if not tickers:
        return

    data = await asyncio.to_thread(_fetch_prices_sync, tickers)

    async with get_db() as db:
        for ticker, info in data.items():
            await db.execute(
                """UPDATE holdings
                   SET current_price = ?, previous_close = ?, last_updated = datetime('now')
                   WHERE ticker = ?""",
                (info["price"], info["previous_close"], ticker),
            )
        await db.commit()

    # Also refresh price history (recent 1 month) so technicals stay current
    for ticker in tickers:
        try:
            await fetch_price_history(ticker, period="1mo")
        except Exception:
            continue


def _fetch_prices_sync(tickers: list[str]) -> dict:
    """Synchronous yfinance batch fetch."""
    result = {}
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            fi = t.fast_info
            price = fi.last_price
            if price is not None:
                result[ticker] = {
                    "price": float(price),
                    "previous_close": float(fi.previous_close) if fi.previous_close else float(price),
                }
        except Exception:
            continue
    return result


async def fetch_price_history(ticker: str, period: str = "1y"):
    """Fetch and store historical OHLCV data for a ticker."""
    df = await asyncio.to_thread(_fetch_history_sync, ticker, period)
    if df is None or df.empty:
        return

    async with get_db() as db:
        for _, row in df.iterrows():
            await db.execute(
                """INSERT OR REPLACE INTO price_history
                   (ticker, date, open, high, low, close, volume)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    ticker,
                    row.name.strftime("%Y-%m-%d"),
                    float(row["Open"]),
                    float(row["High"]),
                    float(row["Low"]),
                    float(row["Close"]),
                    int(row["Volume"]),
                ),
            )
        await db.commit()


def _fetch_history_sync(ticker: str, period: str):
    try:
        t = yf.Ticker(ticker)
        return t.history(period=period)
    except Exception:
        return None


async def get_technicals(ticker: str) -> dict | None:
    """Calculate RSI, SMA, support/resistance for a ticker."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT date, open, high, low, close, volume FROM price_history WHERE ticker = ? ORDER BY date",
            (ticker,),
        )
        rows = await cursor.fetchall()

    if not rows or len(rows) < 20:
        return None

    df = pd.DataFrame([dict(r) for r in rows])
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)

    # SMAs
    df["sma20"] = df["close"].rolling(window=20).mean()
    df["sma50"] = df["close"].rolling(window=50).mean()
    df["sma200"] = df["close"].rolling(window=200).mean()

    # RSI (14-period Wilder's)
    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / 14, min_periods=14).mean()
    avg_loss = loss.ewm(alpha=1 / 14, min_periods=14).mean()
    rs = avg_gain / avg_loss
    df["rsi"] = 100 - (100 / (1 + rs))

    current = float(df["close"].iloc[-1])
    rsi_val = float(df["rsi"].iloc[-1]) if pd.notna(df["rsi"].iloc[-1]) else 50.0

    sma20_val = float(df["sma20"].iloc[-1]) if pd.notna(df["sma20"].iloc[-1]) else None
    sma50_val = float(df["sma50"].iloc[-1]) if pd.notna(df["sma50"].iloc[-1]) else None
    sma200_val = float(df["sma200"].iloc[-1]) if pd.notna(df["sma200"].iloc[-1]) else None

    # Volume: current vs 30-day average
    df["volume"] = df["volume"].astype(float)
    current_volume = float(df["volume"].iloc[-1])
    avg_volume_30 = float(df["volume"].tail(30).mean())
    volume_vs_avg = round(((current_volume - avg_volume_30) / avg_volume_30) * 100, 1) if avg_volume_30 > 0 else 0.0

    # Support/Resistance from recent pivot highs/lows
    recent = df.tail(60)
    support_levels = _find_support_levels(recent)
    resistance_levels = _find_resistance_levels(recent)

    # Trend
    trend = "Neutral"
    if sma20_val and sma50_val:
        if current > sma20_val and sma20_val > sma50_val:
            trend = "Bullish"
        elif current < sma20_val and sma20_val < sma50_val:
            trend = "Bearish"
        elif current > sma50_val:
            trend = "Bullish (LT)"

    # Alert flags: meaningful threshold crossings
    alerts = []
    if rsi_val < 35:
        alerts.append("RSI oversold")
    if rsi_val > 75:
        alerts.append("RSI overbought")
    if support_levels and current <= support_levels[0] * 1.02:
        alerts.append("Near support")
    if resistance_levels and current >= resistance_levels[0] * 0.98:
        alerts.append("Near resistance")
    if sma50_val and sma200_val:
        if sma50_val > sma200_val:
            # Check if golden cross is recent (50d just crossed above 200d)
            prev_sma50 = float(df["sma50"].iloc[-5]) if pd.notna(df["sma50"].iloc[-5]) else None
            prev_sma200 = float(df["sma200"].iloc[-5]) if pd.notna(df["sma200"].iloc[-5]) else None
            if prev_sma50 and prev_sma200 and prev_sma50 <= prev_sma200:
                alerts.append("Golden cross")
        elif sma50_val < sma200_val:
            prev_sma50 = float(df["sma50"].iloc[-5]) if pd.notna(df["sma50"].iloc[-5]) else None
            prev_sma200 = float(df["sma200"].iloc[-5]) if pd.notna(df["sma200"].iloc[-5]) else None
            if prev_sma50 and prev_sma200 and prev_sma50 >= prev_sma200:
                alerts.append("Death cross")

    # Sentiment reasoning factors
    signal_factors = []
    if sma50_val:
        signal_factors.append({"label": "50d SMA", "direction": "above" if current > sma50_val else "below"})
    if sma200_val:
        signal_factors.append({"label": "200d SMA", "direction": "above" if current > sma200_val else "below"})
    if rsi_val < 30:
        signal_factors.append({"label": "RSI", "direction": "oversold"})
    elif rsi_val > 70:
        signal_factors.append({"label": "RSI", "direction": "overbought"})
    else:
        signal_factors.append({"label": "RSI", "direction": "neutral"})

    # Price history for mini chart (last 60 trading days)
    history_tail = df.tail(60)[["date", "close"]].copy()
    price_history_60d = [
        {"date": row["date"], "close": round(float(row["close"]), 2)}
        for _, row in history_tail.iterrows()
    ]

    return {
        "ticker": ticker,
        "price": round(current, 2),
        "rsi": round(rsi_val, 1),
        "sma20": round(sma20_val, 2) if sma20_val else None,
        "sma50": round(sma50_val, 2) if sma50_val else None,
        "sma200": round(sma200_val, 2) if sma200_val else None,
        "support": support_levels,
        "resistance": resistance_levels,
        "trend": trend,
        "note": _generate_note(ticker, current, rsi_val, trend, sma50_val, sma200_val),
        "volume": round(current_volume),
        "avg_volume_30": round(avg_volume_30),
        "volume_vs_avg": volume_vs_avg,
        "alerts": alerts,
        "signal_factors": signal_factors,
        "price_history_60d": price_history_60d,
        "actionable_summary": _generate_actionable_summary(
            ticker, current, rsi_val, trend, sma50_val, sma200_val, alerts
        ),
    }


async def get_price_history(ticker: str, period: str = "3m") -> list[dict]:
    """Return OHLCV close history for a ticker filtered by period."""
    period_days = {"1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365}
    days = period_days.get(period.lower())

    async with get_db() as db:
        if days is None:
            # MAX — return everything
            cursor = await db.execute(
                "SELECT date, close FROM price_history WHERE ticker = ? ORDER BY date",
                (ticker,),
            )
        else:
            cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
            cursor = await db.execute(
                "SELECT date, close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date",
                (ticker, cutoff),
            )
        rows = await cursor.fetchall()

    return [{"date": row["date"], "close": round(float(row["close"]), 2)} for row in rows]


def _find_support_levels(df, count=3):
    """Find support levels from recent lows."""
    lows = df["low"].values
    levels = []
    for i in range(2, len(lows) - 2):
        if lows[i] <= lows[i - 1] and lows[i] <= lows[i - 2] and lows[i] <= lows[i + 1] and lows[i] <= lows[i + 2]:
            levels.append(round(float(lows[i]), 2))
    if not levels:
        levels = [round(float(df["low"].min()), 2)]
    levels = sorted(set(levels), reverse=True)[:count]
    while len(levels) < count:
        levels.append(round(levels[-1] * 0.95, 2))
    return levels


def _find_resistance_levels(df, count=3):
    """Find resistance levels from recent highs."""
    highs = df["high"].values
    levels = []
    for i in range(2, len(highs) - 2):
        if highs[i] >= highs[i - 1] and highs[i] >= highs[i - 2] and highs[i] >= highs[i + 1] and highs[i] >= highs[i + 2]:
            levels.append(round(float(highs[i]), 2))
    if not levels:
        levels = [round(float(df["high"].max()), 2)]
    levels = sorted(set(levels))[:count]
    while len(levels) < count:
        levels.append(round(levels[-1] * 1.05, 2))
    return levels


async def get_portfolio_performance() -> dict:
    """Compute daily historical portfolio value and S&P 500 benchmark.

    For each date in price_history, portfolio_value = sum(shares * close) for
    every held ticker that has a price on that date.  Dates where not all
    tickers have data are still included (partial sums) so we get the longest
    possible history.

    Benchmark uses ^GSPC (S&P 500 index) fetched via yfinance and cached in
    price_history under the ticker '__BENCHMARK__'.
    """
    async with get_db() as db:
        # 1. Get current holdings (ticker + shares)
        cursor = await db.execute("SELECT ticker, shares FROM holdings")
        holdings = {r["ticker"]: r["shares"] for r in await cursor.fetchall()}

        if not holdings:
            return {"dates": [], "portfolio_values": [], "benchmark_values": []}

        # 2. Get all price history for held tickers
        placeholders = ",".join("?" for _ in holdings)
        cursor = await db.execute(
            f"SELECT ticker, date, close FROM price_history "
            f"WHERE ticker IN ({placeholders}) ORDER BY date",
            list(holdings.keys()),
        )
        rows = await cursor.fetchall()

    # Build {date: {ticker: close}} map
    date_prices: dict[str, dict[str, float]] = {}
    for r in rows:
        if r["close"] is not None:
            date_prices.setdefault(r["date"], {})[r["ticker"]] = float(r["close"])

    # Compute daily portfolio values
    sorted_dates = sorted(date_prices.keys())
    portfolio_values = []
    for d in sorted_dates:
        total = sum(
            holdings[t] * date_prices[d][t]
            for t in date_prices[d]
            if t in holdings
        )
        portfolio_values.append(round(total, 2))

    # 3. Benchmark data (S&P 500)
    benchmark_map = await _get_benchmark_data(sorted_dates[0] if sorted_dates else None)
    benchmark_values = [benchmark_map.get(d) for d in sorted_dates]

    return {
        "dates": sorted_dates,
        "portfolio_values": portfolio_values,
        "benchmark_values": benchmark_values,
    }


async def _get_benchmark_data(start_date: str | None) -> dict[str, float]:
    """Return {date: close} for S&P 500, caching in price_history as __BENCHMARK__."""
    if not start_date:
        return {}

    benchmark_ticker = "__BENCHMARK__"

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT date, close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date",
            (benchmark_ticker, start_date),
        )
        rows = await cursor.fetchall()

    # If we have recent data (within 3 days), use cache
    if rows:
        from datetime import datetime, timedelta
        last_date = rows[-1]["date"]
        if datetime.strptime(last_date, "%Y-%m-%d") >= datetime.now() - timedelta(days=3):
            return {r["date"]: float(r["close"]) for r in rows}

    # Fetch fresh from yfinance
    def _fetch():
        try:
            t = yf.Ticker("^GSPC")
            df = t.history(period="max", start=start_date)
            if df is None or df.empty:
                return None
            return df
        except Exception:
            return None

    df = await asyncio.to_thread(_fetch)
    if df is None:
        return {r["date"]: float(r["close"]) for r in rows} if rows else {}

    # Store in DB
    try:
        async with get_db() as db:
            for idx, row in df.iterrows():
                d = idx.strftime("%Y-%m-%d")
                vol = int(row["Volume"]) if pd.notna(row.get("Volume", float("nan"))) else 0
                await db.execute(
                    "INSERT OR REPLACE INTO price_history (ticker, date, open, high, low, close, volume) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (benchmark_ticker, d, float(row["Open"]), float(row["High"]),
                     float(row["Low"]), float(row["Close"]), vol),
                )
            await db.commit()
    except Exception:
        pass  # DB store failed; return in-memory result below

    result = {}
    for idx, row in df.iterrows():
        result[idx.strftime("%Y-%m-%d")] = round(float(row["Close"]), 2)
    return result


def _generate_note(ticker, price, rsi, trend, sma50, sma200):
    """Generate a brief technical note."""
    parts = []
    if rsi < 30:
        parts.append("Oversold territory.")
    elif rsi > 70:
        parts.append("Overbought territory.")

    if sma50 and sma200:
        if sma50 > sma200 and price > sma50:
            parts.append("Golden cross pattern. Above both MAs.")
        elif sma50 < sma200 and price < sma50:
            parts.append("Death cross pattern. Below both MAs.")
        elif price > sma50:
            parts.append("Above 50-day SMA.")
        else:
            parts.append("Below 50-day SMA.")

    if not parts:
        parts.append(f"{trend} trend based on moving averages.")

    return " ".join(parts)


def _generate_actionable_summary(ticker, price, rsi, trend, sma50, sma200, alerts):
    """Generate a one-line actionable decision nudge."""
    # Long-term stance
    if sma200 and price > sma200:
        lt_stance = "bullish long-term"
    elif sma200 and price < sma200:
        lt_stance = "bearish long-term"
    else:
        lt_stance = "no clear long-term signal"

    # Short-term context
    st_context = ""
    if sma50 and price > sma50:
        st_context = ", above 50d SMA"
    elif sma50 and price < sma50:
        st_context = ", below 50d SMA"

    # Action recommendation
    if rsi < 30:
        action = "oversold — consider adding on this dip"
    elif rsi > 75:
        action = "overbought — consider trimming or waiting for a pullback"
    elif "Near resistance" in alerts:
        action = "watch for breakout or rejection near resistance"
    elif "Near support" in alerts:
        action = "support may provide a floor — watch for bounce"
    elif "Golden cross" in alerts:
        action = "golden cross detected — bullish momentum building"
    elif "Death cross" in alerts:
        action = "death cross detected — bearish momentum building"
    elif trend == "Bullish":
        action = "consider holding or adding on dips"
    elif trend == "Bearish":
        action = "consider reducing or avoiding new adds"
    else:
        action = "no strong signal — hold and monitor"

    return f"{ticker} is {lt_stance}{st_context} — {action}."


# --- News ---

_news_cache: dict[str, dict] = {}
NEWS_CACHE_TTL = 1800  # 30 minutes


def _fetch_news_sync(ticker: str) -> list[dict]:
    """Fetch recent news articles for a ticker via yfinance."""
    try:
        from datetime import datetime
        t = yf.Ticker(ticker)
        raw = t.news or []
        articles = []
        for item in raw[:5]:
            # New yfinance format (>=0.2.44): content nested under "content" key
            content = item.get("content") or {}
            if content:
                title = content.get("title", "")
                link = (content.get("canonicalUrl") or {}).get("url", "")
                publisher = (content.get("provider") or {}).get("displayName", "")
                pub_date_str = content.get("pubDate", "")
                try:
                    published_at = int(datetime.fromisoformat(pub_date_str.replace("Z", "+00:00")).timestamp()) if pub_date_str else 0
                except Exception:
                    published_at = 0
            else:
                # Old format: flat keys
                title = item.get("title", "")
                link = item.get("link", "")
                publisher = item.get("publisher", "")
                published_at = item.get("providerPublishTime", 0)

            if title:
                articles.append({"title": title, "link": link, "publisher": publisher, "published_at": published_at})
        return articles
    except Exception:
        return []


async def get_news(ticker: str) -> dict:
    """Get cached news for a ticker."""
    now = time.time()
    cached = _news_cache.get(ticker)
    if cached and (now - cached["timestamp"]) < NEWS_CACHE_TTL:
        return {"ticker": ticker, "articles": cached["articles"]}

    articles = await asyncio.to_thread(_fetch_news_sync, ticker)
    _news_cache[ticker] = {"timestamp": now, "articles": articles}
    return {"ticker": ticker, "articles": articles}


# --- Fundamentals ---

_fundamentals_cache: dict[str, dict] = {}
FUNDAMENTALS_CACHE_TTL = 86400  # 24 hours


def _fetch_fundamentals_sync(ticker: str) -> dict:
    """Fetch fundamental valuation data via yfinance."""
    try:
        t = yf.Ticker(ticker)
        info = t.info
        return {
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "earnings_growth": info.get("earningsGrowth"),
            "dividend_yield": info.get("dividendYield"),
            "trailing_eps": info.get("trailingEps"),
            "market_cap": info.get("marketCap"),
            "sector": info.get("sector"),
            "earnings_date": info.get("earningsDate"),
            "ex_dividend_date": info.get("exDividendDate"),
        }
    except Exception:
        return {}


async def get_fundamentals(ticker: str) -> dict:
    """Get cached fundamentals for a ticker."""
    now = time.time()
    cached = _fundamentals_cache.get(ticker)
    if cached and (now - cached["timestamp"]) < FUNDAMENTALS_CACHE_TTL:
        return {"ticker": ticker, **cached["data"]}

    data = await asyncio.to_thread(_fetch_fundamentals_sync, ticker)
    _fundamentals_cache[ticker] = {"timestamp": now, "data": data}
    return {"ticker": ticker, **data}
