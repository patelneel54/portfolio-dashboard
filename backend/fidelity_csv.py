"""Parser for Fidelity 401k CSV exports."""

import csv
import io
import re

# Map Fidelity category/asset class names to our asset_class values
CATEGORY_MAP = {
    "large cap": "large_cap",
    "mid-cap": "mid_cap",
    "mid cap": "mid_cap",
    "small cap": "small_cap",
    "international": "international",
    "income": "bond",
    "bond investments": "bond",
    "bond": "bond",
    "stable value": "stable_value",
    "specialty": "specialty",
    "short-term investments": "money_market",
    "money market": "money_market",
    "blended investment": "blended",
    "target date": "target_date",
    "target retirement": "target_date",
}

# Benchmark proxy mapping for funds without yfinance tickers
BENCHMARK_MAP = {
    "large_cap": "IWD",     # iShares Russell 1000 Value
    "mid_cap": "VOT",       # Vanguard Mid-Cap Growth
    "small_cap": "IJR",     # iShares Core S&P Small-Cap
    "international": "VXUS", # Vanguard Total International Stock
    "bond": "AGG",          # iShares Core US Aggregate Bond
    "stable_value": "SHV",  # iShares Short Treasury Bond
    "specialty": "VNQ",     # Vanguard Real Estate
    "money_market": "SHV",
    "blended": "VBINX",     # Vanguard Balanced Index (not always on yfinance)
}


def _is_valid_ticker(symbol: str) -> bool:
    """Check if a symbol looks like a real ticker vs a CUSIP or junk."""
    if not symbol:
        return False
    # CUSIPs are 9 chars with mixed digits/letters (e.g. 31617E851, 84679P389)
    if re.fullmatch(r'[A-Z0-9]{9}', symbol):
        return False
    # Symbols with special characters (e.g. SPAXX**)
    if re.search(r'[^A-Z]', symbol):
        return False
    # Valid tickers are 1-6 uppercase letters
    return bool(re.fullmatch(r'[A-Z]{1,6}', symbol))


def _extract_ticker(name: str) -> str | None:
    """Extract ticker symbol from fund name like 'FID 500 INDEX (FXAIX)'."""
    match = re.search(r'\(([A-Z]{2,6})\)', name)
    return match.group(1) if match else None


def _sanitize_name_to_ticker(name: str) -> str:
    """Convert a fund name to a short unique ticker-like code."""
    # Take first letters of significant words, max 12 chars
    words = re.sub(r'[^A-Z0-9\s]', '', name.upper()).split()
    # Skip small words
    significant = [w for w in words if len(w) > 1 or w in ('I', 'N', 'R')]
    code = '-'.join(significant[:4])
    return code[:16] if code else name[:16].upper().replace(' ', '-')


def _classify_category(category: str, asset_class: str) -> str:
    """Map Fidelity category/asset class to our asset_class value."""
    combined = f"{asset_class} {category}".lower().strip()

    for key, value in CATEGORY_MAP.items():
        if key in combined:
            return value

    return "unclassified"


def _parse_money(value: str) -> float:
    """Parse a money string like '$6,935.15' to float."""
    cleaned = re.sub(r'[^\d.\-]', '', value)
    return float(cleaned) if cleaned else 0.0


def parse_fidelity_csv(text: str) -> list[dict]:
    """Parse Fidelity 401k CSV export text into a list of holding dicts.

    Supports multiple Fidelity export formats:
    - Balance Overview format: Name, Asset Class, Category, % Invested, Balance, Cost Basis
    - Position format: Name/Description, Symbol, Quantity, Price, Value, Cost Basis
    """
    lines = text.strip().splitlines()
    if not lines:
        return []

    # Skip any header lines before the actual CSV data
    start = 0
    for i, line in enumerate(lines):
        if any(header in line.lower() for header in ['name', 'description', 'symbol', 'ticker']):
            start = i
            break

    csv_text = '\n'.join(lines[start:])
    reader = csv.DictReader(io.StringIO(csv_text))

    if not reader.fieldnames:
        return []

    # Normalize field names (lowercase, strip whitespace)
    fields = {f.strip().lower(): f for f in reader.fieldnames}

    holdings = []

    for row in reader:
        # Normalize row keys (skip None keys from trailing commas)
        norm_row = {k.strip().lower(): v.strip() if v else '' for k, v in row.items() if k is not None}

        # Skip total/summary rows and money market cash positions
        if any(skip in norm_row.get('name', '').lower() for skip in ['account total', 'total', 'pending']):
            continue
        if any(skip in norm_row.get('name/initial purchase date', '').lower() for skip in ['account total', 'total']):
            continue
        if 'money market' in norm_row.get('description', '').lower():
            continue

        # Extract name - try multiple column names
        name = (
            norm_row.get('name', '') or
            norm_row.get('name/initial purchase date', '') or
            norm_row.get('description', '') or
            ''
        ).strip()

        if not name:
            continue

        # Clean multi-line name (remove date lines like "01/30/2025")
        name_parts = name.split('\n')
        name = name_parts[0].strip()

        # Extract or find ticker
        ticker = (
            norm_row.get('symbol', '') or
            norm_row.get('ticker', '') or
            _extract_ticker(name) or
            ''
        ).strip().upper()

        # Get balance/value
        balance = _parse_money(
            norm_row.get('balance', '') or
            norm_row.get('value', '') or
            norm_row.get('current value', '') or
            '0'
        )

        # Get cost basis
        cost_basis = _parse_money(
            norm_row.get('cost basis total', '') or
            norm_row.get('cost basis', '') or
            norm_row.get('cost', '') or
            '0'
        )

        if balance <= 0:
            continue

        # Get asset class/category
        asset_class_raw = norm_row.get('asset class', '') or ''
        category_raw = norm_row.get('category', '') or ''
        asset_class = _classify_category(category_raw, asset_class_raw)

        # Determine if manual (no yfinance ticker)
        is_manual = not _is_valid_ticker(ticker)

        if is_manual:
            # Generate a ticker code from the name
            ticker = _sanitize_name_to_ticker(name)

        # Compute shares and avg_cost
        # For mutual funds, we might have quantity/price
        quantity = norm_row.get('quantity', '') or norm_row.get('shares', '')
        price = norm_row.get('price', '') or norm_row.get('last price', '')

        if quantity and price:
            shares = float(re.sub(r'[^\d.\-]', '', quantity) or '0')
            current_price = float(re.sub(r'[^\d.\-]', '', price) or '0')
        elif balance > 0:
            # Estimate: for funds, use balance and cost basis
            # Assume current_price = some reasonable per-share value
            current_price = balance  # Treat as 1 share with value = balance
            shares = 1.0

        # Use average cost basis column if available, otherwise compute from total
        avg_cost_raw = norm_row.get('average cost basis', '')
        if avg_cost_raw:
            avg_cost = _parse_money(avg_cost_raw)
        else:
            avg_cost = cost_basis / shares if shares > 0 else current_price

        entry = {
            "ticker": ticker,
            "name": name,
            "manual_name": name if is_manual else None,
            "shares": round(shares, 6),
            "avg_cost": round(avg_cost, 4),
            "current_price": round(current_price, 4) if current_price else round(balance, 2),
            "asset_class": asset_class,
            "is_manual": is_manual,
            "type": "Fund",
            "benchmark_ticker": BENCHMARK_MAP.get(asset_class) if is_manual else None,
        }

        holdings.append(entry)

    return holdings
