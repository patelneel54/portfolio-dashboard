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
