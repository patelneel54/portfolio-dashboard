"""
One-time seed script to add user's Fidelity 401k holdings.
Run from the backend directory: python seed_401k.py
"""
import sqlite3
import os

DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "portfolio.db"))

HOLDINGS = [
    # (ticker, type, shares, avg_cost, current_price, account_type, asset_class, is_manual, manual_name, benchmark_ticker)
    ("FXAIX", "Fund", None, None, None, "401k", "large_cap", 0, None, None),          # FID 500 INDEX — $6,935.15 balance, $6,607.31 cost
    ("FTIHX", "Fund", None, None, None, "401k", "international", 0, None, None),       # FID TOTAL INTL IDX — $3,981.93 balance, $3,474.33 cost
    ("FSPGX", "Fund", None, None, None, "401k", "large_cap", 0, None, None),           # FID LG CAP GR IDX — $3,248.54 balance, $3,052.41 cost
    ("GG-FIAM-FXINC", "Fund", None, None, None, "401k", "bond", 1, "GG FIAM CP FXINC N", "AGG"),  # Manual bond fund — $3,248.03 balance, $3,122.60 cost
    ("MDIZX", "Fund", None, None, None, "401k", "international", 0, None, None),       # MFS INTL DIVRSN R6 — $2,571.69 balance, $2,328.49 cost
    ("FSMDX", "Fund", None, None, None, "401k", "mid_cap", 0, None, None),             # FID MID CAP IDX — $2,023.13 balance, $1,903.17 cost
    ("LG-CAP-VAL-III", "Fund", None, None, None, "401k", "large_cap", 1, "LARGE CAP VAL III I1", "IWD"),  # Manual large cap — $1,482.00 balance, $1,344.79 cost
    ("TS-MID-QUAL-GR", "Fund", None, None, None, "401k", "mid_cap", 1, "TS MID CAP QUAL GR N", "VOT"),   # Manual mid cap — $482.93 balance, $538.13 cost
    ("FSSNX", "Fund", None, None, None, "401k", "small_cap", 0, None, None),           # FID SM CAP IDX — $388.48 balance, $403.69 cost
    ("FSRNX", "Fund", None, None, None, "401k", "specialty", 0, None, None),           # FID REAL ESTATE IDX — $104.16 balance, $101.93 cost
]

# Balances and cost bases from Fidelity screenshots
BALANCES = {
    "FXAIX": (6935.15, 6607.31),
    "FTIHX": (3981.93, 3474.33),
    "FSPGX": (3248.54, 3052.41),
    "GG-FIAM-FXINC": (3248.03, 3122.60),
    "MDIZX": (2571.69, 2328.49),
    "FSMDX": (2023.13, 1903.17),
    "LG-CAP-VAL-III": (1482.00, 1344.79),
    "TS-MID-QUAL-GR": (482.93, 538.13),
    "FSSNX": (388.48, 403.69),
    "FSRNX": (104.16, 101.93),
}

# Known prices for public tickers (will be refreshed on next price update)
# For manual holdings, we compute price from balance data
KNOWN_PRICES = {
    "FXAIX": 205.37,
    "FTIHX": 14.98,
    "FSPGX": 25.17,
    "MDIZX": 29.41,
    "FSMDX": 32.88,
    "FSSNX": 30.14,
    "FSRNX": 27.06,
}


def seed():
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Run migrations for new columns (safe to re-run — errors on duplicates are ignored)
    migrations = [
        "ALTER TABLE holdings ADD COLUMN asset_class TEXT DEFAULT NULL",
        "ALTER TABLE holdings ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE holdings ADD COLUMN manual_name TEXT DEFAULT NULL",
        "ALTER TABLE holdings ADD COLUMN benchmark_ticker TEXT DEFAULT NULL",
    ]
    for m in migrations:
        try:
            cursor.execute(m)
        except sqlite3.OperationalError:
            pass  # column already exists

    added = 0
    skipped = 0

    for ticker, typ, _, _, _, account_type, asset_class, is_manual, manual_name, benchmark in HOLDINGS:
        # Check if already exists
        cursor.execute(
            "SELECT id FROM holdings WHERE ticker = ? AND account_type = ?",
            (ticker, account_type),
        )
        if cursor.fetchone():
            print(f"  SKIP {ticker} — already exists in {account_type}")
            skipped += 1
            continue

        balance, cost_basis = BALANCES[ticker]

        if is_manual:
            # For manual holdings, treat balance as market value
            # Use cost_basis / balance to derive a "price" and shares
            current_price = balance  # store total value as price with 1 share
            # Actually, let's compute a per-share price from cost basis
            # Assume 1 share = full balance (we don't know real share count for institutional funds)
            shares = 1.0
            avg_cost = cost_basis
            current_price = balance
        else:
            # For public tickers, compute shares from balance / known price
            price = KNOWN_PRICES.get(ticker, balance)  # fallback to balance if no price
            shares = round(balance / price, 4)
            avg_cost = round(cost_basis / shares, 2)
            current_price = price

        cursor.execute(
            """INSERT INTO holdings (ticker, type, shares, avg_cost, target_allocation,
               current_price, previous_close, last_updated, account_type,
               is_manual, manual_name, asset_class, benchmark_ticker)
               VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'), ?, ?, ?, ?, ?)""",
            (
                ticker, typ, shares, avg_cost,
                current_price, current_price,
                account_type,
                is_manual, manual_name, asset_class, benchmark,
            ),
        )
        label = manual_name or ticker
        print(f"  ADD  {label} — {shares} shares @ ${avg_cost:.2f}, value ${balance:,.2f}")
        added += 1

    conn.commit()
    conn.close()
    print(f"\nDone: {added} added, {skipped} skipped")


if __name__ == "__main__":
    print(f"Seeding 401k holdings into {DATABASE_PATH}...\n")
    seed()
