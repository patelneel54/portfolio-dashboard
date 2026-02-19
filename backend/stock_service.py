import asyncio
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
    """Fetch current prices for all holdings."""
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

    # Beta approximation (not available without market data, return None)
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
    }


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
