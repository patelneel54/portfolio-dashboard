import asyncio
import time
import json
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
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
    """Classify a ticker as ETF, Fund, Crypto, or Stock."""
    if ticker.upper() in KNOWN_ETFS:
        return "ETF"
    if ticker.upper().endswith("-USD"):
        return "Crypto"
    try:
        t = yf.Ticker(ticker)
        info = t.info
        qt = info.get("quoteType", "")
        if qt == "ETF":
            return "ETF"
        if qt == "MUTUALFUND":
            return "Fund"
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
        cursor = await db.execute(
            "SELECT DISTINCT ticker, is_manual, benchmark_ticker, current_price FROM holdings"
        )
        rows = [dict(r) for r in await cursor.fetchall()]

    # Separate auto vs manual holdings
    auto_tickers = [r["ticker"] for r in rows if not r["is_manual"]]
    manual_with_bench = [r for r in rows if r["is_manual"] and r["benchmark_ticker"]]

    # Collect all tickers to fetch (auto + benchmarks for manual)
    benchmark_tickers = list({r["benchmark_ticker"] for r in manual_with_bench})
    all_fetch_tickers = list(set(auto_tickers + benchmark_tickers))

    if not all_fetch_tickers:
        return

    data = await asyncio.to_thread(_fetch_prices_sync, all_fetch_tickers)

    async with get_db() as db:
        # Update auto holdings directly
        for ticker, info in data.items():
            if ticker in auto_tickers:
                await db.execute(
                    """UPDATE holdings
                       SET current_price = ?, previous_close = ?, last_updated = datetime('now')
                       WHERE ticker = ? AND is_manual = 0""",
                    (info["price"], info["previous_close"], ticker),
                )

        # Update manual holdings via benchmark proxy
        for manual in manual_with_bench:
            bench = manual["benchmark_ticker"]
            if bench in data and manual["current_price"]:
                bench_info = data[bench]
                # Get the benchmark's previous close to compute % change
                if bench_info.get("previous_close") and bench_info["previous_close"] > 0:
                    pct_change = (bench_info["price"] - bench_info["previous_close"]) / bench_info["previous_close"]
                    new_price = manual["current_price"] * (1 + pct_change)
                    await db.execute(
                        """UPDATE holdings
                           SET current_price = ?, previous_close = ?, last_updated = datetime('now')
                           WHERE ticker = ? AND is_manual = 1""",
                        (round(new_price, 4), manual["current_price"], manual["ticker"]),
                    )

        await db.commit()

    # Also refresh price history (recent 1 month) so technicals stay current
    for ticker in auto_tickers:
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

    # MACD (12/26/9)
    ema12 = df["close"].ewm(span=12).mean()
    ema26 = df["close"].ewm(span=26).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9).mean()
    histogram = macd_line - signal_line

    macd_val = float(macd_line.iloc[-1]) if pd.notna(macd_line.iloc[-1]) else None
    macd_signal_val = float(signal_line.iloc[-1]) if pd.notna(signal_line.iloc[-1]) else None
    macd_hist_val = float(histogram.iloc[-1]) if pd.notna(histogram.iloc[-1]) else None

    macd_tail = df.tail(60)[["date"]].copy()
    macd_tail["macd"] = macd_line.tail(60).values
    macd_tail["signal"] = signal_line.tail(60).values
    macd_tail["histogram"] = histogram.tail(60).values
    macd_history = [
        {
            "date": row["date"],
            "macd": round(float(row["macd"]), 4) if pd.notna(row["macd"]) else None,
            "signal": round(float(row["signal"]), 4) if pd.notna(row["signal"]) else None,
            "histogram": round(float(row["histogram"]), 4) if pd.notna(row["histogram"]) else None,
        }
        for _, row in macd_tail.iterrows()
    ]

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
        "macd": round(macd_val, 4) if macd_val is not None else None,
        "macd_signal": round(macd_signal_val, 4) if macd_signal_val is not None else None,
        "macd_histogram": round(macd_hist_val, 4) if macd_hist_val is not None else None,
        "macd_history": macd_history,
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


async def get_portfolio_performance(account_type: str | None = None) -> dict:
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
        if account_type:
            cursor = await db.execute(
                "SELECT ticker, shares FROM holdings WHERE account_type = ?",
                (account_type,),
            )
        else:
            cursor = await db.execute("SELECT ticker, shares FROM holdings")
        # Aggregate shares per ticker (same ticker may appear in multiple accounts)
        holdings: dict[str, float] = {}
        for r in await cursor.fetchall():
            holdings[r["ticker"]] = holdings.get(r["ticker"], 0) + r["shares"]

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

    # Forward-fill: on dates where a ticker has no data (e.g. stocks on
    # weekends when crypto still trades), carry the last known close forward
    # so the portfolio value doesn't drop to near-zero.
    sorted_dates = sorted(date_prices.keys())
    last_known: dict[str, float] = {}
    for d in sorted_dates:
        for t in date_prices[d]:
            last_known[t] = date_prices[d][t]
        for t in holdings:
            if t not in date_prices[d] and t in last_known:
                date_prices[d][t] = last_known[t]

    # Compute daily portfolio values
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
            "annual_dividend_per_share": info.get("trailingAnnualDividendRate"),
            "industry": info.get("industry"),
            "category": info.get("category"),
            "beta": info.get("beta"),
            "revenue_growth": info.get("revenueGrowth"),
            "volume_24h": info.get("volume"),
            "circulating_supply": info.get("circulatingSupply"),
            "total_supply": info.get("totalSupply"),
            "long_name": info.get("longName") or info.get("shortName"),
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


# --- Portfolio Intelligence (sector + dividend aggregation) ---

SECTOR_COLORS = {
    "Technology": "#6366f1",
    "Financial Services": "#3b82f6",
    "Healthcare": "#10b981",
    "Consumer Cyclical": "#f59e0b",
    "Communication Services": "#ec4899",
    "Industrials": "#06b6d4",
    "Consumer Defensive": "#84cc16",
    "Energy": "#ef4444",
    "Real Estate": "#8b5cf6",
    "Utilities": "#14b8a6",
    "Basic Materials": "#f97316",
    "Diversified ETF": "#60a5fa",
    "Crypto": "#F7931A",
    "Unknown": "#475569",
    # ETF fund categories (from yfinance)
    "Large Blend": "#3b82f6",
    "Large Growth": "#6366f1",
    "Large Value": "#10b981",
    "Mid-Cap Blend": "#06b6d4",
    "Mid-Cap Growth": "#8b5cf6",
    "Mid-Cap Value": "#14b8a6",
    "Small Blend": "#f59e0b",
    "Small Growth": "#ec4899",
    "Small Value": "#f97316",
    "Intermediate Core Bond": "#38bdf8",
    "Intermediate Core-Plus Bond": "#22d3ee",
    "Short-Term Bond": "#67e8f9",
    "Long-Term Bond": "#0ea5e9",
    "High Yield Bond": "#ef4444",
    "Foreign Large Blend": "#a78bfa",
    "Foreign Large Growth": "#c084fc",
    "World Large Stock": "#818cf8",
    "Target-Date Retirement": "#84cc16",
    "Foreign Small/Mid Blend": "#d946ef",
    "World Bond": "#7dd3fc",
    "Diversified Fund": "#94a3b8",
}

_FALLBACK_COLORS = [
    "#475569", "#64748b", "#78716c", "#a3a3a3", "#71717a",
    "#94a3b8", "#6b7280", "#9ca3af", "#a1a1aa", "#737373",
]


def _get_sector_color(name: str, index: int = 0) -> str:
    """Return a distinct color for a sector, with dynamic fallbacks."""
    if name in SECTOR_COLORS:
        return SECTOR_COLORS[name]
    return _FALLBACK_COLORS[index % len(_FALLBACK_COLORS)]


def _infer_fund_category(name: str) -> str:
    """Infer a fund category from its name when yfinance doesn't provide one."""
    n = name.lower()
    # Real estate
    if "real estate" in n or "reit" in n:
        return "Real Estate"
    # Bond / fixed income
    if any(w in n for w in ["bond", "income", "treasury", "aggregate", "fixed"]):
        if "high yield" in n or "high-yield" in n:
            return "High Yield Bond"
        if "short" in n:
            return "Short-Term Bond"
        if "long" in n:
            return "Long-Term Bond"
        if "international" in n or "global" in n:
            return "World Bond"
        return "Intermediate Core Bond"
    # International / foreign equity
    if any(w in n for w in ["international", "foreign", "overseas", "global", "world"]):
        if "small" in n:
            return "Foreign Small/Mid Blend"
        return "Foreign Large Blend"
    # Index / market cap
    if "500" in n or "s&p" in n or "total market" in n or "total stock" in n:
        return "Large Blend"
    if "small" in n and "cap" in n or "small" in n and ("value" in n or "growth" in n or "blend" in n):
        if "growth" in n:
            return "Small Growth"
        if "value" in n:
            return "Small Value"
        return "Small Blend"
    if "mid" in n and ("cap" in n or "value" in n or "growth" in n or "blend" in n):
        if "growth" in n:
            return "Mid-Cap Growth"
        if "value" in n:
            return "Mid-Cap Value"
        return "Mid-Cap Blend"
    if "growth" in n:
        return "Large Growth"
    if "value" in n:
        return "Large Value"
    if "index" in n:
        return "Large Blend"
    return ""


def _resolve_sector(fund: dict, holding_type: str) -> str:
    """Resolve sector from fundamentals, falling back for ETFs, Funds, and Crypto."""
    if holding_type == "Crypto":
        return "Crypto"
    sector = fund.get("sector")
    if sector:
        return sector
    category = fund.get("category")
    if category:
        return category
    # For mutual funds / ETFs without a category, infer from name
    if holding_type in ("Fund", "ETF"):
        long_name = fund.get("long_name") or ""
        if long_name:
            inferred = _infer_fund_category(long_name)
            if inferred:
                return inferred
        return "Diversified Fund" if holding_type == "Fund" else "Diversified ETF"
    return "Unknown"


async def get_portfolio_intelligence(account_type: str | None = None) -> dict:
    """Compute sector exposure and dividend profile for the portfolio."""
    async with get_db() as db:
        if account_type:
            cursor = await db.execute(
                "SELECT id, ticker, type, shares, avg_cost, current_price, account_type FROM holdings WHERE account_type = ?",
                (account_type,),
            )
        else:
            cursor = await db.execute(
                "SELECT id, ticker, type, shares, avg_cost, current_price, account_type FROM holdings"
            )
        rows = await cursor.fetchall()

    if not rows:
        return {
            "sectors": [],
            "sector_hhi": 0,
            "sector_hhi_label": "N/A",
            "total_value": 0,
            "dividends": {"holdings": [], "summary": {}},
        }

    holdings = [dict(r) for r in rows]

    # Fetch fundamentals for each ticker (uses 24hr cache)
    fundamentals = {}
    for h in holdings:
        fundamentals[h["ticker"]] = await get_fundamentals(h["ticker"])

    total_value = sum(
        h["shares"] * (h["current_price"] or h["avg_cost"]) for h in holdings
    )
    total_cost = sum(h["shares"] * h["avg_cost"] for h in holdings)

    # ── Sector aggregation ──
    sector_map: dict[str, dict] = {}
    for h in holdings:
        ticker = h["ticker"]
        price = h["current_price"] or h["avg_cost"]
        mv = h["shares"] * price
        fund = fundamentals.get(ticker, {})
        sector = _resolve_sector(fund, h["type"])

        if sector not in sector_map:
            sector_map[sector] = {"value": 0, "tickers": []}
        sector_map[sector]["value"] += mv
        sector_map[sector]["tickers"].append(
            {"ticker": ticker, "market_value": round(mv, 2)}
        )

    sectors = []
    for idx, (name, data) in enumerate(sector_map.items()):
        pct = (data["value"] / total_value * 100) if total_value else 0
        risk = "high" if pct > 35 else "elevated" if pct > 25 else "normal"
        sectors.append({
            "sector": name,
            "value": round(data["value"], 2),
            "percentage": round(pct, 2),
            "risk": risk,
            "color": _get_sector_color(name, idx),
            "tickers": data["tickers"],
        })
    sectors.sort(key=lambda s: s["value"], reverse=True)

    sector_hhi = sum(s["percentage"] ** 2 for s in sectors)
    if sector_hhi > 2500:
        hhi_label = "High concentration"
    elif sector_hhi > 1500:
        hhi_label = "Moderate concentration"
    else:
        hhi_label = "Diversified"

    # ── Dividend aggregation ──
    dividend_holdings = []
    total_annual_income = 0.0

    for h in holdings:
        ticker = h["ticker"]
        price = h["current_price"] or h["avg_cost"]
        mv = h["shares"] * price
        fund = fundamentals.get(ticker, {})

        annual_div_ps = fund.get("annual_dividend_per_share") or 0
        div_yield = fund.get("dividend_yield") or 0
        annual_income = h["shares"] * annual_div_ps
        total_annual_income += annual_income

        yoc = (
            (annual_div_ps / h["avg_cost"] * 100)
            if h["avg_cost"] and annual_div_ps
            else 0
        )

        sector = _resolve_sector(fund, h["type"])

        dividend_holdings.append({
            "id": h["id"],
            "ticker": ticker,
            "account_type": h.get("account_type", "brokerage"),
            "shares": h["shares"],
            "annual_dividend_per_share": round(annual_div_ps, 4),
            "annual_income": round(annual_income, 2),
            "dividend_yield": round(div_yield, 2) if div_yield else 0,
            "yield_on_cost": round(yoc, 2),
            "market_value": round(mv, 2),
            "sector": sector,
        })

    dividend_holdings.sort(key=lambda d: d["annual_income"], reverse=True)

    weighted_yield = (total_annual_income / total_value * 100) if total_value else 0
    weighted_yoc = (total_annual_income / total_cost * 100) if total_cost else 0

    income_by_sector: dict[str, float] = {}
    for dh in dividend_holdings:
        s = dh["sector"]
        income_by_sector[s] = income_by_sector.get(s, 0) + dh["annual_income"]

    income_by_sector_list = [
        {"sector": k, "income": round(v, 2)}
        for k, v in sorted(income_by_sector.items(), key=lambda x: x[1], reverse=True)
        if v > 0
    ]

    return {
        "sectors": sectors,
        "sector_hhi": round(sector_hhi, 0),
        "sector_hhi_label": hhi_label,
        "total_value": round(total_value, 2),
        "dividends": {
            "holdings": dividend_holdings,
            "summary": {
                "total_annual_income": round(total_annual_income, 2),
                "monthly_income": round(total_annual_income / 12, 2),
                "weighted_yield": round(weighted_yield, 2),
                "weighted_yield_on_cost": round(weighted_yoc, 2),
                "income_by_sector": income_by_sector_list,
            },
        },
    }


# --- Dividend Calendar ---

_dividend_calendar_cache: dict[str, dict] = {}
DIVIDEND_CALENDAR_CACHE_TTL = 3600  # 1 hour


def _infer_dividend_frequency(dividends_series) -> int:
    """Infer payment frequency from historical dividend series.

    Returns approximate payments per year: 12, 4, 2, or 1.
    """
    if len(dividends_series) < 2:
        return 4  # assume quarterly
    dates = dividends_series.index.sort_values()
    gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    median_gap = sorted(gaps)[len(gaps) // 2]
    if median_gap <= 45:
        return 12
    elif median_gap <= 120:
        return 4
    elif median_gap <= 220:
        return 2
    return 1


def _fetch_dividend_events_sync(ticker: str, year: int, month: int) -> list[dict]:
    """Fetch dividend events for a ticker in a given month. Runs on thread."""
    try:
        t = yf.Ticker(ticker)
        divs = t.dividends

        events = []
        month_start = datetime(year, month, 1)
        if month == 12:
            month_end = datetime(year + 1, 1, 1)
        else:
            month_end = datetime(year, month + 1, 1)

        # Historical payment events from dividends series
        if divs is not None and len(divs) > 0:
            for dt_idx, amount in divs.items():
                dt_naive = dt_idx.to_pydatetime().replace(tzinfo=None)
                if month_start <= dt_naive < month_end:
                    events.append({
                        "date": dt_naive.strftime("%Y-%m-%d"),
                        "type": "payment",
                        "amount_per_share": round(float(amount), 4),
                        "estimated": False,
                    })

        # Fetch .info separately — it can be slow/fail for some tickers
        info = {}
        try:
            info = t.info or {}
        except Exception:
            pass

        # Ex-dividend date from .info
        ex_div_ts = info.get("exDividendDate")
        annual_rate = info.get("trailingAnnualDividendRate") or 0
        frequency = _infer_dividend_frequency(divs) if divs is not None and len(divs) >= 2 else 4

        if ex_div_ts:
            try:
                if isinstance(ex_div_ts, (int, float)):
                    ex_dt = datetime.fromtimestamp(ex_div_ts)
                else:
                    ex_dt = datetime.fromisoformat(str(ex_div_ts).replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                ex_dt = None
            if ex_dt and month_start <= ex_dt < month_end:
                per_share = round(annual_rate / frequency, 4) if frequency and annual_rate else 0
                # Avoid duplicate if already in historical data
                ex_date_str = ex_dt.strftime("%Y-%m-%d")
                if not any(e["date"] == ex_date_str for e in events):
                    events.append({
                        "date": ex_date_str,
                        "type": "ex-dividend",
                        "amount_per_share": per_share,
                        "estimated": False,
                    })

        # Future projections for months beyond known data
        if annual_rate > 0 and divs is not None and len(divs) >= 2:
            interval_days = 365 // frequency
            last_known = divs.index.sort_values()[-1].to_pydatetime().replace(tzinfo=None)
            per_share_est = round(annual_rate / frequency, 4)
            projected = last_known
            # Project up to 2 years forward
            for _ in range(frequency * 2):
                projected = projected + timedelta(days=interval_days)
                if projected >= month_end:
                    break
                if month_start <= projected < month_end:
                    proj_str = projected.strftime("%Y-%m-%d")
                    if not any(e["date"] == proj_str for e in events):
                        events.append({
                            "date": proj_str,
                            "type": "payment",
                            "amount_per_share": per_share_est,
                            "estimated": True,
                        })

        return events
    except Exception:
        return []


async def get_dividend_calendar(month: str, account_type: str | None = None) -> dict:
    """Return dividend events for all holdings in a given month."""
    # Validate month format
    try:
        parts = month.split("-")
        if len(parts) != 2:
            raise ValueError()
        year, mo = int(parts[0]), int(parts[1])
        if mo < 1 or mo > 12 or year < 2000 or year > 2100:
            raise ValueError()
    except (ValueError, IndexError):
        raise ValueError("month must be in YYYY-MM format (e.g. 2026-03)")

    async with get_db() as db:
        if account_type:
            cursor = await db.execute(
                "SELECT id, ticker, shares, account_type FROM holdings WHERE account_type = ?",
                (account_type,),
            )
        else:
            cursor = await db.execute(
                "SELECT id, ticker, shares, account_type FROM holdings"
            )
        rows = await cursor.fetchall()

    if not rows:
        return {"month": month, "events": [], "total_estimated_income": 0}

    holdings = [dict(r) for r in rows]
    all_events = []
    now = time.time()

    # Separate cached vs uncached holdings
    cached_results = {}
    uncached_holdings = []
    for h in holdings:
        ticker = h["ticker"]
        cache_key = f"{ticker}:{month}"
        cached = _dividend_calendar_cache.get(cache_key)
        if cached and (now - cached["timestamp"]) < DIVIDEND_CALENDAR_CACHE_TTL:
            cached_results[ticker] = cached["data"]
        else:
            uncached_holdings.append(h)

    # Fetch uncached tickers in parallel (with concurrency limit)
    async def _fetch_one(ticker):
        try:
            return await asyncio.to_thread(
                _fetch_dividend_events_sync, ticker, year, mo
            )
        except Exception:
            return []

    if uncached_holdings:
        unique_tickers = list({h["ticker"] for h in uncached_holdings})
        tasks = [_fetch_one(t) for t in unique_tickers]
        results = await asyncio.gather(*tasks)
        for ticker, events in zip(unique_tickers, results):
            cache_key = f"{ticker}:{month}"
            _dividend_calendar_cache[cache_key] = {
                "timestamp": now,
                "data": events,
            }
            cached_results[ticker] = events

    for h in holdings:
        ticker_events = cached_results.get(h["ticker"], [])
        for ev in ticker_events:
            estimated_income = round(ev["amount_per_share"] * h["shares"], 2)
            all_events.append({
                **ev,
                "ticker": h["ticker"],
                "shares_held": h["shares"],
                "estimated_income": estimated_income,
                "account_type": h.get("account_type", "brokerage"),
            })

    all_events.sort(key=lambda e: e["date"])
    total = sum(e["estimated_income"] for e in all_events)

    return {
        "month": month,
        "events": all_events,
        "total_estimated_income": round(total, 2),
    }


# --- Dividend History (monthly income totals) ---

_dividend_history_cache: dict[str, dict] = {}
DIVIDEND_HISTORY_CACHE_TTL = 3600  # 1 hour


def _fetch_dividend_history_sync(
    ticker: str, shares: float, months: int
) -> list[dict]:
    """Fetch monthly dividend totals for a single ticker over the last N months."""
    try:
        t = yf.Ticker(ticker)
        divs = t.dividends
        if divs is None or len(divs) == 0:
            return []

        now = datetime.now()
        start_date = now - timedelta(days=months * 31)

        results = []
        for dt_idx, amount in divs.items():
            dt = dt_idx.to_pydatetime().replace(tzinfo=None)
            if dt < start_date:
                continue
            income = float(amount) * shares
            results.append({
                "date": dt.strftime("%Y-%m-%d"),
                "month": dt.strftime("%Y-%m"),
                "ticker": ticker,
                "per_share": round(float(amount), 4),
                "shares": shares,
                "amount": round(income, 2),
            })
        return results
    except Exception:
        return []


async def get_dividend_history(
    months: int = 12, account_type: str | None = None
) -> dict:
    """Return monthly dividend income for the last N months."""
    cache_key = f"history:{months}:{account_type or 'all'}"
    now = time.time()
    cached = _dividend_history_cache.get(cache_key)
    if cached and (now - cached["timestamp"]) < DIVIDEND_HISTORY_CACHE_TTL:
        return cached["data"]

    async with get_db() as db:
        if account_type:
            cursor = await db.execute(
                "SELECT id, ticker, shares, account_type FROM holdings WHERE account_type = ?",
                (account_type,),
            )
        else:
            cursor = await db.execute(
                "SELECT id, ticker, shares, account_type FROM holdings"
            )
        rows = await cursor.fetchall()

    if not rows:
        return {"months": []}

    holdings = [dict(r) for r in rows]

    # Fetch dividend history for each unique ticker in parallel
    ticker_shares: dict[str, float] = {}
    for h in holdings:
        ticker_shares[h["ticker"]] = ticker_shares.get(h["ticker"], 0) + h["shares"]

    async def _fetch_one(ticker, shares):
        try:
            return await asyncio.to_thread(
                _fetch_dividend_history_sync, ticker, shares, months
            )
        except Exception:
            return []

    tasks = [_fetch_one(t, s) for t, s in ticker_shares.items()]
    results = await asyncio.gather(*tasks)

    # Flatten all events and group by month
    all_events = []
    for events in results:
        all_events.extend(events)

    monthly_map: dict[str, dict] = {}
    for ev in all_events:
        mk = ev["month"]
        if mk not in monthly_map:
            monthly_map[mk] = {"total": 0, "by_ticker": []}
        monthly_map[mk]["total"] += ev["amount"]
        monthly_map[mk]["by_ticker"].append({
            "ticker": ev["ticker"],
            "per_share": ev["per_share"],
            "shares": ev["shares"],
            "amount": ev["amount"],
        })

    month_list = []
    for mk in sorted(monthly_map.keys()):
        data = monthly_map[mk]
        month_list.append({
            "month": mk,
            "total": round(data["total"], 2),
            "by_ticker": sorted(
                data["by_ticker"], key=lambda x: x["amount"], reverse=True
            ),
        })

    result = {"months": month_list}
    _dividend_history_cache[cache_key] = {"timestamp": now, "data": result}
    return result


# --- Portfolio Analytics (enriched 3-level drill-down data) ---


async def get_portfolio_analytics(account_type: str | None = None) -> dict:
    """Compute enriched analytics for 3-level drill-down views."""
    async with get_db() as db:
        if account_type:
            cursor = await db.execute(
                "SELECT id, ticker, type, shares, avg_cost, current_price, previous_close, account_type "
                "FROM holdings WHERE account_type = ?",
                (account_type,),
            )
        else:
            cursor = await db.execute(
                "SELECT id, ticker, type, shares, avg_cost, current_price, previous_close, account_type "
                "FROM holdings"
            )
        rows = await cursor.fetchall()

    if not rows:
        return {
            "holdings_detail": [],
            "sectors_detail": [],
            "portfolio_risk": {},
            "factors": {},
            "total_value": 0,
            "total_cost": 0,
        }

    holdings = [dict(r) for r in rows]

    # Fetch fundamentals for each ticker (uses 24hr cache)
    fundamentals = {}
    for h in holdings:
        fundamentals[h["ticker"]] = await get_fundamentals(h["ticker"])

    total_value = sum(
        h["shares"] * (h["current_price"] or h["avg_cost"]) for h in holdings
    )
    total_cost = sum(h["shares"] * h["avg_cost"] for h in holdings)

    # Per-holding enrichment
    holdings_detail = []
    sector_agg: dict[str, dict] = {}

    for h in holdings:
        ticker = h["ticker"]
        price = h["current_price"] or h["avg_cost"]
        mv = h["shares"] * price
        cost = h["shares"] * h["avg_cost"]
        weight = (mv / total_value) if total_value else 0
        gain_loss_pct = (
            ((price - h["avg_cost"]) / h["avg_cost"]) if h["avg_cost"] else 0
        )
        return_contribution = weight * gain_loss_pct

        fund = fundamentals.get(ticker, {})
        beta = fund.get("beta")
        pe = fund.get("trailing_pe")
        sector = _resolve_sector(fund, h["type"])

        # Normalize growth fields: yfinance returns as ratios (0.183 = 18.3%)
        # Convert to percentage values for consistent frontend display
        raw_eg = fund.get("earnings_growth")
        raw_rg = fund.get("revenue_growth")
        earnings_growth_pct = round(raw_eg * 100, 2) if raw_eg is not None else None
        revenue_growth_pct = round(raw_rg * 100, 2) if raw_rg is not None else None

        # dividend_yield: yfinance returns as percentage already (1.1 = 1.1%)
        raw_dy = fund.get("dividend_yield")
        dividend_yield_pct = round(raw_dy, 2) if raw_dy is not None else None

        detail = {
            "id": h["id"],
            "ticker": ticker,
            "account_type": h.get("account_type", "brokerage"),
            "type": h["type"],
            "shares": h["shares"],
            "avg_cost": h["avg_cost"],
            "current_price": round(price, 2),
            "market_value": round(mv, 2),
            "cost_basis": round(cost, 2),
            "weight": round(weight * 100, 2),
            "gain_loss_pct": round(gain_loss_pct * 100, 2),
            "return_contribution": round(return_contribution * 100, 4),
            "beta": beta,
            "trailing_pe": pe,
            "forward_pe": fund.get("forward_pe"),
            "earnings_growth": earnings_growth_pct,
            "revenue_growth": revenue_growth_pct,
            "dividend_yield": dividend_yield_pct,
            "market_cap": fund.get("market_cap"),
            "sector": sector,
            "industry": fund.get("industry"),
        }
        holdings_detail.append(detail)

        # Aggregate into sectors
        if sector not in sector_agg:
            sector_agg[sector] = {
                "value": 0,
                "cost": 0,
                "beta_weighted": 0,
                "pe_weighted": 0,
                "pe_weight_total": 0,
                "beta_weight_total": 0,
                "holdings": [],
            }
        sa = sector_agg[sector]
        sa["value"] += mv
        sa["cost"] += cost
        if beta is not None:
            sa["beta_weighted"] += beta * mv
            sa["beta_weight_total"] += mv
        if pe is not None and pe > 0:
            sa["pe_weighted"] += pe * mv
            sa["pe_weight_total"] += mv
        sa["holdings"].append(detail)

    # Build sectors_detail
    sectors_detail = []
    portfolio_beta_weighted = 0.0
    portfolio_beta_weight_total = 0.0

    for idx, (name, data) in enumerate(sector_agg.items()):
        pct = (data["value"] / total_value * 100) if total_value else 0
        wtd_beta = (
            (data["beta_weighted"] / data["beta_weight_total"])
            if data["beta_weight_total"]
            else None
        )
        wtd_pe = (
            (data["pe_weighted"] / data["pe_weight_total"])
            if data["pe_weight_total"]
            else None
        )
        sector_return = (
            ((data["value"] - data["cost"]) / data["cost"]) if data["cost"] else 0
        )
        sector_return_contribution = (pct / 100) * sector_return

        # Risk badge logic
        risk = "normal"
        if pct > 25:
            risk = "CONCENTRATION"
        elif wtd_beta is not None and wtd_beta > 1.5:
            risk = "ELEVATED"
        elif wtd_beta is not None and wtd_beta > 1.2:
            risk = "MODERATE"

        sectors_detail.append(
            {
                "sector": name,
                "value": round(data["value"], 2),
                "percentage": round(pct, 2),
                "weighted_beta": round(wtd_beta, 2) if wtd_beta is not None else None,
                "weighted_pe": round(wtd_pe, 2) if wtd_pe is not None else None,
                "return_contribution": round(sector_return_contribution * 100, 2),
                "holdings_count": len(data["holdings"]),
                "risk": risk,
                "color": _get_sector_color(name, idx),
                "holdings": data["holdings"],
            }
        )

        if data["beta_weight_total"]:
            portfolio_beta_weighted += data["beta_weighted"]
            portfolio_beta_weight_total += data["beta_weight_total"]

    sectors_detail.sort(key=lambda s: s["value"], reverse=True)

    # Portfolio-level risk
    portfolio_beta = (
        (portfolio_beta_weighted / portfolio_beta_weight_total)
        if portfolio_beta_weight_total
        else None
    )
    top_positions = sorted(
        holdings_detail, key=lambda h: h["weight"], reverse=True
    )[:3]
    top3_concentration = sum(h["weight"] for h in top_positions)
    sector_hhi = sum(s["percentage"] ** 2 for s in sectors_detail)

    # Parametric VaR (95%, 1-day): portfolio_beta * ~1% daily S&P vol * 1.645
    var_95 = (
        round(total_value * (portfolio_beta or 1) * 0.01 * 1.645, 2)
        if total_value
        else 0
    )

    portfolio_risk = {
        "portfolio_beta": round(portfolio_beta, 2) if portfolio_beta is not None else None,
        "sector_concentration_hhi": round(sector_hhi, 0),
        "top_3_concentration": round(top3_concentration, 2),
        "top_3_tickers": [h["ticker"] for h in top_positions],
        "var_95_1day": var_95,
    }

    # Factor analysis
    large_cap = sum(
        h["weight"]
        for h in holdings_detail
        if (h.get("market_cap") or 0) > 10_000_000_000
    )
    mid_cap = sum(
        h["weight"]
        for h in holdings_detail
        if 2_000_000_000 < (h.get("market_cap") or 0) <= 10_000_000_000
    )
    small_cap = sum(
        h["weight"]
        for h in holdings_detail
        if 0 < (h.get("market_cap") or 0) <= 2_000_000_000
    )
    # Weight-averaged metrics across portfolio
    wtd_pe_sum = sum(
        (h.get("trailing_pe") or 0) * h["weight"] for h in holdings_detail
    )
    wtd_pe_weight = sum(
        h["weight"] for h in holdings_detail if h.get("trailing_pe")
    )
    wtd_div_sum = sum(
        (h.get("dividend_yield") or 0) * h["weight"] for h in holdings_detail
    )
    wtd_div_weight = sum(
        h["weight"] for h in holdings_detail if h.get("dividend_yield")
    )

    factors = {
        "large_cap_pct": round(large_cap, 1),
        "mid_cap_pct": round(mid_cap, 1),
        "small_cap_pct": round(small_cap, 1),
        "unclassified_pct": round(100 - large_cap - mid_cap - small_cap, 1),
        "weighted_pe": (
            round(wtd_pe_sum / wtd_pe_weight, 2) if wtd_pe_weight else None
        ),
        "weighted_dividend_yield": (
            round(wtd_div_sum / wtd_div_weight, 2) if wtd_div_weight else None
        ),
        "weighted_beta": (
            round(portfolio_beta, 2) if portfolio_beta is not None else None
        ),
    }

    return {
        "holdings_detail": holdings_detail,
        "sectors_detail": sectors_detail,
        "portfolio_risk": portfolio_risk,
        "factors": factors,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
    }


# --- Crypto Market Data (Fear & Greed + CoinGecko Global) ---

_fear_greed_cache: dict = {}
_crypto_global_cache: dict = {}
CRYPTO_MARKET_CACHE_TTL = 900  # 15 minutes


def _fetch_fear_greed_sync() -> dict:
    """Fetch Fear & Greed Index from alternative.me."""
    try:
        req = Request(
            "https://api.alternative.me/fng/?limit=30",
            headers={"User-Agent": "PortfolioDashboard/1.0"},
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        entries = data.get("data", [])
        return {
            "current": {
                "value": int(entries[0]["value"]) if entries else 0,
                "classification": entries[0].get("value_classification", "N/A") if entries else "N/A",
            },
            "history": [
                {
                    "value": int(e["value"]),
                    "classification": e.get("value_classification", ""),
                    "date": datetime.fromtimestamp(int(e["timestamp"])).strftime("%Y-%m-%d"),
                }
                for e in entries
            ],
        }
    except Exception as e:
        return {"current": {"value": 0, "classification": "N/A"}, "history": [], "error": str(e)}


async def get_fear_greed() -> dict:
    """Get cached Fear & Greed Index."""
    now = time.time()
    cached = _fear_greed_cache.get("data")
    if cached and (now - cached["timestamp"]) < CRYPTO_MARKET_CACHE_TTL:
        return cached["result"]

    result = await asyncio.to_thread(_fetch_fear_greed_sync)
    _fear_greed_cache["data"] = {"timestamp": now, "result": result}
    return result


def _fetch_crypto_global_sync() -> dict:
    """Fetch global crypto market data from CoinGecko."""
    try:
        req = Request(
            "https://api.coingecko.com/api/v3/global",
            headers={"User-Agent": "PortfolioDashboard/1.0"},
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        gd = data.get("data", {})
        return {
            "total_market_cap_usd": gd.get("total_market_cap", {}).get("usd", 0),
            "total_volume_24h_usd": gd.get("total_volume", {}).get("usd", 0),
            "btc_dominance": gd.get("market_cap_percentage", {}).get("btc", 0),
            "eth_dominance": gd.get("market_cap_percentage", {}).get("eth", 0),
            "market_cap_change_24h_pct": gd.get("market_cap_change_percentage_24h_usd", 0),
            "active_cryptocurrencies": gd.get("active_cryptocurrencies", 0),
        }
    except Exception as e:
        return {"total_market_cap_usd": 0, "btc_dominance": 0, "error": str(e)}


async def get_crypto_global() -> dict:
    """Get cached global crypto market data."""
    now = time.time()
    cached = _crypto_global_cache.get("data")
    if cached and (now - cached["timestamp"]) < CRYPTO_MARKET_CACHE_TTL:
        return cached["result"]

    result = await asyncio.to_thread(_fetch_crypto_global_sync)
    _crypto_global_cache["data"] = {"timestamp": now, "result": result}
    return result


# ── Bond Metrics ──

_bond_cache = {}
BOND_CACHE_TTL = 86400  # 24 hours


def _fetch_bond_metrics_sync(ticker: str) -> dict:
    """Fetch bond-specific metrics from yfinance."""
    try:
        t = yf.Ticker(ticker)
        info = t.info
        return {
            "ticker": ticker,
            "yield_pct": info.get("yield", info.get("dividendYield")),
            "sec_yield": info.get("ytdReturn"),
            "expense_ratio": info.get("annualReportExpenseRatio") or info.get("totalExpenseRatio"),
            "total_assets": info.get("totalAssets"),
            "category": info.get("category", ""),
            "fund_family": info.get("fundFamily", ""),
            "inception_date": info.get("fundInceptionDate"),
            "three_year_return": info.get("threeYearAverageReturn"),
            "five_year_return": info.get("fiveYearAverageReturn"),
            "ten_year_return": info.get("tenYearAverageReturn", None),
            "beta": info.get("beta3Year"),
            "morningstar_rating": info.get("morningStarOverallRating"),
        }
    except Exception:
        return {"ticker": ticker}


async def get_bond_metrics(ticker: str) -> dict:
    """Get cached bond fund metrics."""
    now = time.time()
    cached = _bond_cache.get(ticker)
    if cached and (now - cached["timestamp"]) < BOND_CACHE_TTL:
        return cached["result"]

    result = await asyncio.to_thread(_fetch_bond_metrics_sync, ticker)
    _bond_cache[ticker] = {"timestamp": now, "result": result}
    return result


# ── Rebalance Suggestions ──

# Age-based allocation models
ALLOCATION_MODELS = {
    "aggressive": {"stocks": 90, "bonds": 10, "label": "Aggressive (age < 30)"},
    "moderate": {"stocks": 70, "bonds": 25, "label": "Moderate (age 30-50)"},
    "conservative": {"stocks": 50, "bonds": 40, "label": "Conservative (age 50+)"},
}

STOCK_CLASSES = {"large_cap", "mid_cap", "small_cap", "international", "specialty", "blended"}
BOND_CLASSES = {"bond", "stable_value", "money_market"}


async def get_rebalance_suggestions(account_type: str | None = None) -> dict:
    """Generate smart rebalancing suggestions based on asset class allocation and age."""
    async with get_db() as db:
        if account_type:
            cursor = await db.execute(
                "SELECT * FROM holdings WHERE account_type = ?", (account_type,)
            )
        else:
            cursor = await db.execute("SELECT * FROM holdings")
        holdings = [dict(r) for r in await cursor.fetchall()]

        # Get age from settings
        age_cursor = await db.execute("SELECT value FROM settings WHERE key = 'age'")
        age_row = await age_cursor.fetchone()
        age = int(age_row["value"]) if age_row else 30

    if not holdings:
        return {"suggestions": [], "allocation": {}, "model": {}}

    total_value = sum(h["shares"] * (h["current_price"] or h["avg_cost"]) for h in holdings)
    if total_value <= 0:
        return {"suggestions": [], "allocation": {}, "model": {}}

    # Determine age-based model
    if age < 30:
        model = ALLOCATION_MODELS["aggressive"]
        model_key = "aggressive"
    elif age < 50:
        model = ALLOCATION_MODELS["moderate"]
        model_key = "moderate"
    else:
        model = ALLOCATION_MODELS["conservative"]
        model_key = "conservative"

    # Compute actual allocation by asset class
    class_values = {}
    for h in holdings:
        mv = h["shares"] * (h["current_price"] or h["avg_cost"])
        ac = h.get("asset_class") or "unclassified"
        class_values[ac] = class_values.get(ac, 0) + mv

    class_pcts = {k: round((v / total_value) * 100, 1) for k, v in class_values.items()}

    # Compute stocks vs bonds split
    stock_pct = sum(class_pcts.get(c, 0) for c in STOCK_CLASSES)
    stock_pct += class_pcts.get("unclassified", 0)  # Assume unclassified are stocks
    bond_pct = sum(class_pcts.get(c, 0) for c in BOND_CLASSES)
    other_pct = 100 - stock_pct - bond_pct

    suggestions = []

    # 1. Stocks vs Bonds balance
    target_stocks = model["stocks"]
    target_bonds = model["bonds"]
    stock_diff = stock_pct - target_stocks
    bond_diff = bond_pct - target_bonds

    if bond_diff < -10:
        suggestions.append({
            "severity": "warning",
            "category": "asset_allocation",
            "message": f"Your bond allocation is {bond_pct:.0f}% vs recommended {target_bonds}% for age {age}. Consider increasing fixed income exposure.",
            "action": f"Shift ~${abs(bond_diff) / 100 * total_value:,.0f} from stocks to bond funds.",
        })
    elif bond_diff < -5:
        suggestions.append({
            "severity": "info",
            "category": "asset_allocation",
            "message": f"Bond allocation ({bond_pct:.0f}%) is slightly below the {target_bonds}% target for your age group.",
            "action": "Consider gradually increasing bond allocation with future contributions.",
        })

    if stock_diff > 15:
        suggestions.append({
            "severity": "warning",
            "category": "asset_allocation",
            "message": f"You're {stock_diff:.0f}% overweight in stocks relative to the {model['label']} model.",
            "action": "Consider rebalancing toward bonds to reduce portfolio risk.",
        })

    # 2. Domestic vs International split (within stocks)
    domestic_pct = sum(class_pcts.get(c, 0) for c in ["large_cap", "mid_cap", "small_cap", "specialty"])
    domestic_pct += class_pcts.get("unclassified", 0)
    intl_pct = class_pcts.get("international", 0)
    total_stock = domestic_pct + intl_pct

    if total_stock > 0:
        intl_share = (intl_pct / total_stock) * 100
        if intl_share < 20:
            suggestions.append({
                "severity": "info",
                "category": "diversification",
                "message": f"International stocks are only {intl_share:.0f}% of your equity allocation. A common target is 25-40%.",
                "action": "Consider increasing international fund holdings for geographic diversification.",
            })
        elif intl_share > 50:
            suggestions.append({
                "severity": "info",
                "category": "diversification",
                "message": f"International stocks are {intl_share:.0f}% of your equity — above the typical 25-40% range.",
                "action": "Consider whether your international exposure matches your risk tolerance.",
            })

    # 3. Concentration risk
    for h in holdings:
        mv = h["shares"] * (h["current_price"] or h["avg_cost"])
        pct = (mv / total_value) * 100
        name = h.get("manual_name") or h["ticker"]
        if pct > 30:
            suggestions.append({
                "severity": "warning",
                "category": "concentration",
                "message": f"Strong concentration in {name} ({pct:.0f}% of portfolio).",
                "action": "Consider diversifying to reduce single-fund risk.",
            })
        elif pct > 20:
            suggestions.append({
                "severity": "info",
                "category": "concentration",
                "message": f"{name} is {pct:.0f}% of your portfolio — relatively concentrated.",
                "action": "Monitor this position; consider trimming if it grows further.",
            })

    # 4. Missing asset classes
    if class_pcts.get("small_cap", 0) == 0 and total_stock > 0:
        suggestions.append({
            "severity": "info",
            "category": "diversification",
            "message": "No small-cap exposure. Small caps can improve long-term growth potential.",
            "action": "Consider adding a small-cap index fund.",
        })

    return {
        "suggestions": suggestions,
        "allocation": {
            "by_class": class_pcts,
            "stocks_pct": round(stock_pct, 1),
            "bonds_pct": round(bond_pct, 1),
            "other_pct": round(other_pct, 1),
        },
        "model": {
            "key": model_key,
            "label": model["label"],
            "target_stocks": target_stocks,
            "target_bonds": target_bonds,
            "age": age,
        },
        "total_value": round(total_value, 2),
    }
