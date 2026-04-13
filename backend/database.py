import os
import aiosqlite
from contextlib import asynccontextmanager

DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "portfolio.db"))

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Stock',
    shares REAL NOT NULL DEFAULT 0,
    avg_cost REAL NOT NULL DEFAULT 0,
    target_allocation REAL NOT NULL DEFAULT 0,
    current_price REAL DEFAULT NULL,
    previous_close REAL DEFAULT NULL,
    last_updated TEXT DEFAULT NULL,
    purchase_date TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    account_type TEXT NOT NULL DEFAULT 'brokerage',
    UNIQUE(ticker, account_type)
);

CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume INTEGER,
    UNIQUE(ticker, date)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('price_below', 'price_above', 'drift_above')),
    threshold REAL NOT NULL,
    triggered INTEGER NOT NULL DEFAULT 0,
    triggered_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    account_type TEXT NOT NULL,
    institution TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_targets (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    target_allocation REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, ticker)
);
"""

DEFAULT_SETTINGS = {
    "monthly_contribution": "500",
    "age": "26",
    "conservative_rate": "0.06",
    "moderate_rate": "0.085",
    "aggressive_rate": "0.11",
    "projection_years": "30",
    "monthly_401k_contribution": "0",
}


async def init_db():
    """Create tables and seed defaults."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(SCHEMA_SQL)
        for key, value in DEFAULT_SETTINGS.items():
            await db.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )
        # Migrations for existing databases
        migrations = [
            "ALTER TABLE holdings ADD COLUMN purchase_date TEXT DEFAULT NULL",
            "ALTER TABLE holdings ADD COLUMN account_type TEXT NOT NULL DEFAULT 'brokerage'",
            "DROP INDEX IF EXISTS sqlite_autoindex_holdings_1",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_ticker_account ON holdings(ticker, account_type)",
            "ALTER TABLE holdings ADD COLUMN asset_class TEXT DEFAULT NULL",
            "ALTER TABLE holdings ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE holdings ADD COLUMN manual_name TEXT DEFAULT NULL",
            "ALTER TABLE holdings ADD COLUMN benchmark_ticker TEXT DEFAULT NULL",
            # Multi-brokerage / named-account support
            "ALTER TABLE holdings ADD COLUMN account_id INTEGER REFERENCES accounts(id)",
            "INSERT OR IGNORE INTO accounts (name, account_type) "
            "SELECT DISTINCT 'Default ' || account_type, account_type FROM holdings",
            "UPDATE holdings SET account_id = ("
            "  SELECT id FROM accounts "
            "  WHERE accounts.account_type = holdings.account_type "
            "    AND accounts.name = 'Default ' || holdings.account_type"
            ") WHERE account_id IS NULL",
            "DROP INDEX IF EXISTS idx_holdings_ticker_account",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_ticker_account_id "
            "ON holdings(ticker, account_id)",
            "INSERT OR IGNORE INTO account_targets (account_id, ticker, target_allocation) "
            "SELECT account_id, ticker, target_allocation FROM holdings "
            "WHERE target_allocation > 0 AND account_id IS NOT NULL",
        ]
        for migration in migrations:
            try:
                await db.execute(migration)
            except Exception:
                pass  # Column already exists
        await db.commit()


@asynccontextmanager
async def get_db():
    """Async context manager for database connections."""
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
