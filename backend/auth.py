import os
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_pin_hash_str = os.getenv("AUTH_PIN_HASH", "")
_plain_pin = os.getenv("AUTH_PIN", "")
if _pin_hash_str:
    PIN_HASH = _pin_hash_str.encode()
elif _plain_pin:
    PIN_HASH = bcrypt.hashpw(_plain_pin.encode(), bcrypt.gensalt())
else:
    PIN_HASH = b""
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 72


def verify_pin(pin: str) -> bool:
    if not PIN_HASH:
        return True  # No PIN configured = no auth required
    return bcrypt.checkpw(pin.encode(), PIN_HASH)


def create_token() -> str:
    payload = {
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def require_auth(request: Request):
    """FastAPI dependency that validates JWT from Authorization header."""
    if not PIN_HASH:
        return  # No PIN configured = skip auth
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth_header.split(" ", 1)[1]
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# CLI utility: python auth.py <PIN> to generate a hash
if __name__ == "__main__":
    import sys
    pin = sys.argv[1] if len(sys.argv) > 1 else input("Enter PIN: ")
    hashed = bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()
    print(f"\nAdd this to your .env file:")
    print(f"AUTH_PIN_HASH={hashed}")
