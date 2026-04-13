import os
import time
import bcrypt
import jwt
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_pin_hash_str = os.getenv("AUTH_PIN_HASH", "")
_plain_pin = os.getenv("AUTH_PIN", "")
if _pin_hash_str:
    ENV_PIN_HASH = _pin_hash_str.encode()
elif _plain_pin:
    ENV_PIN_HASH = bcrypt.hashpw(_plain_pin.encode(), bcrypt.gensalt())
else:
    ENV_PIN_HASH = b""
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 72

# Cached DB-side auth state. Invalidated on update_pin_hash(); reloaded lazily.
_auth_cache = {"loaded": False, "db_hash": None, "pin_changed_at": None}

# In-memory auth rate limiter, keyed by client IP. Resets on process restart.
RATE_LIMIT_MAX_FAILURES = 5
RATE_LIMIT_WINDOW_SECONDS = 15 * 60
_auth_failures: dict[str, list[float]] = defaultdict(list)


def _invalidate_auth_cache():
    _auth_cache["loaded"] = False


async def _load_auth_cache():
    from database import get_db
    try:
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT key, value FROM settings WHERE key IN ('auth_pin_hash', 'pin_changed_at')"
            )
            rows = {r["key"]: r["value"] for r in await cursor.fetchall()}
    except Exception:
        rows = {}

    raw_hash = rows.get("auth_pin_hash")
    _auth_cache["db_hash"] = raw_hash.encode() if raw_hash else None

    pca = rows.get("pin_changed_at")
    ts = None
    if pca:
        try:
            # SQLite datetime('now') returns UTC "YYYY-MM-DD HH:MM:SS"
            ts = int(datetime.strptime(pca, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            ts = None
    _auth_cache["pin_changed_at"] = ts
    _auth_cache["loaded"] = True


async def _get_effective_pin_hash() -> bytes | None:
    """Return DB hash if present, else env hash. None means no PIN configured."""
    if not _auth_cache["loaded"]:
        await _load_auth_cache()
    if _auth_cache["db_hash"]:
        return _auth_cache["db_hash"]
    return ENV_PIN_HASH if ENV_PIN_HASH else None


async def get_pin_hash_from_db():
    """Backward-compatible accessor used by other modules."""
    if not _auth_cache["loaded"]:
        await _load_auth_cache()
    return _auth_cache["db_hash"]


async def verify_pin_async(pin: str) -> bool:
    """Check PIN against the effective hash (DB first, env fallback)."""
    effective = await _get_effective_pin_hash()
    if not effective:
        return True  # No PIN configured = no auth required
    return bcrypt.checkpw(pin.encode(), effective)


def verify_pin(pin: str) -> bool:
    """Synchronous verify against env PIN only (used at startup)."""
    if not ENV_PIN_HASH:
        return True
    return bcrypt.checkpw(pin.encode(), ENV_PIN_HASH)


async def update_pin_hash(new_pin: str):
    """Hash a new PIN, store in settings, bump pin_changed_at, invalidate cache."""
    from database import get_db
    new_hash = bcrypt.hashpw(new_pin.encode(), bcrypt.gensalt()).decode()
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('auth_pin_hash', ?)",
            (new_hash,),
        )
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_changed_at', datetime('now'))"
        )
        await db.commit()
    _invalidate_auth_cache()


def create_token() -> str:
    payload = {
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def require_auth(request: Request):
    """FastAPI dependency: validate JWT and ensure it post-dates the current PIN."""
    effective = await _get_effective_pin_hash()
    if not effective:
        return  # No PIN set anywhere → first-boot mode, auth disabled
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    pin_changed_at = _auth_cache.get("pin_changed_at")
    iat = payload.get("iat")
    if pin_changed_at and iat and iat < pin_changed_at:
        raise HTTPException(status_code=401, detail="Token revoked")


# ── Rate limiter helpers ──

def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request):
    """Raise 429 if this client has too many recent auth failures."""
    ip = _client_ip(request)
    now = time.time()
    recent = [t for t in _auth_failures[ip] if now - t < RATE_LIMIT_WINDOW_SECONDS]
    _auth_failures[ip] = recent
    if len(recent) >= RATE_LIMIT_MAX_FAILURES:
        retry_after = int(RATE_LIMIT_WINDOW_SECONDS - (now - recent[0]))
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Try again later.",
            headers={"Retry-After": str(max(1, retry_after))},
        )


def record_auth_failure(request: Request):
    _auth_failures[_client_ip(request)].append(time.time())


def reset_auth_failures(request: Request):
    _auth_failures.pop(_client_ip(request), None)


# CLI utility: python auth.py <PIN> to generate a hash
if __name__ == "__main__":
    import sys
    pin = sys.argv[1] if len(sys.argv) > 1 else input("Enter PIN: ")
    hashed = bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()
    print(f"\nAdd this to your .env file:")
    print(f"AUTH_PIN_HASH={hashed}")
