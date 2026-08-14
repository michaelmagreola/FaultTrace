"""Password hashing, signed sessions, and simple login rate limiting."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict
from threading import Lock

from app.config import settings

_PBKDF2_PREFIX = "pbkdf2_sha256$"
_PBKDF2_ITERATIONS = 200_000

# IP -> list of attempt timestamps (login rate limit)
_login_attempts: dict[str, list[float]] = defaultdict(list)
_login_lock = Lock()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ITERATIONS,
    )
    return f"{_PBKDF2_PREFIX}{_PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    if not stored.startswith(_PBKDF2_PREFIX):
        # Legacy plaintext (migrated on boot) — compare in constant time
        return hmac.compare_digest(password, stored)
    try:
        _, iters_s, salt, expected = stored.split("$", 3)
        iterations = int(iters_s)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return hmac.compare_digest(digest.hex(), expected)


def create_session_token(email: str, role: str) -> str:
    payload = {
        "email": email.lower().strip(),
        "role": role,
        "exp": int(time.time()) + int(settings.session_ttl_seconds),
        "v": 1,
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    sig = hmac.new(
        settings.session_secret.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{body}.{sig}"


def verify_session_token(token: str) -> dict | None:
    try:
        body, sig = token.strip().split(".", 1)
    except ValueError:
        return None
    expected = hmac.new(
        settings.session_secret.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    pad = "=" * (-len(body) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + pad).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    role = payload.get("role")
    email = payload.get("email")
    if role not in {"technician", "planner", "admin"} or not email:
        return None
    return {"email": str(email).lower(), "role": str(role)}


def check_login_rate_limit(client_key: str) -> None:
    """Raise ValueError if too many recent failures from this client."""
    now = time.time()
    window = float(settings.login_rate_window_seconds)
    max_attempts = int(settings.login_rate_max_attempts)
    with _login_lock:
        attempts = [t for t in _login_attempts[client_key] if now - t < window]
        _login_attempts[client_key] = attempts
        if len(attempts) >= max_attempts:
            raise ValueError(
                f"Too many login attempts. Try again in {int(window)} seconds."
            )


def record_login_failure(client_key: str) -> None:
    with _login_lock:
        _login_attempts[client_key].append(time.time())


def clear_login_failures(client_key: str) -> None:
    with _login_lock:
        _login_attempts.pop(client_key, None)
