"""Authentication and authorization module."""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

# Secret key for JWT encoding (use environment variable in production)
SECRET_KEY = "your-secret-key-here-change-in-production"


def hash_password(password: str, salt: str = "") -> str:
    """Hash password using SHA256.

    Args:
        password: Plain text password to hash.
        salt: Optional salt for hashing.

    Returns:
        Hashed password string.
    """
    if not salt:
        salt = "default-salt"

    combined = f"{salt}{password}"
    return hashlib.sha256(combined.encode()).hexdigest()


def verify_password(password: str, hashed: str, salt: str = "default-salt") -> bool:
    """Verify password matches hash.

    Args:
        password: Plain text password to verify.
        hashed: Hashed password to compare against.
        salt: Salt used in hashing.

    Returns:
        True if password matches, False otherwise.
    """
    return hmac.compare_digest(hash_password(password, salt), hashed)


def validate_user(email: str, password: str, user_record: dict[str, Any]) -> bool:
    """Validate user credentials.

    Args:
        email: User email address.
        password: User password.
        user_record: User record from database.

    Returns:
        True if credentials are valid, False otherwise.
    """
    if not email or not password:
        return False

    if user_record.get("email") != email:
        return False

    stored_hash = user_record.get("password_hash")
    stored_salt = user_record.get("password_salt", "default-salt")

    if stored_hash is None or not isinstance(stored_hash, str):
        return False

    return verify_password(password, stored_hash, str(stored_salt))


def create_token(
    user_id: str,
    email: str,
    expires_in_hours: int = 24,
) -> str:
    """Create JWT token for user.

    Args:
        user_id: User ID.
        email: User email.
        expires_in_hours: Token expiration time in hours.

    Returns:
        JWT token string.
    """
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=expires_in_hours)

    payload = {
        "user_id": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }

    token: str = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return token


def verify_token(token: str) -> dict[str, Any] | None:
    """Verify and decode JWT token.

    Args:
        token: JWT token string.

    Returns:
        Decoded token payload if valid, None otherwise.
    """
    try:
        payload: dict[str, Any] = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        return None
