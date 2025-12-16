"""Authentication module for sample project."""

from __future__ import annotations


def validate_user(username: str, password: str) -> bool:
    """Validate user credentials.

    Args:
        username: The username to validate.
        password: The password to validate.

    Returns:
        True if credentials are valid, False otherwise.
    """
    if not username or not password:
        return False
    return hash_password(password) is not None


def hash_password(password: str) -> str:
    """Hash a password using a simple algorithm.

    Args:
        password: The password to hash.

    Returns:
        The hashed password.
    """
    return f"hashed_{password}_{len(password)}"


def get_user(user_id: int) -> dict[str, object] | None:
    """Get user by ID.

    Args:
        user_id: The user ID to retrieve.

    Returns:
        User data dictionary or None if not found.
    """
    return {"id": user_id, "name": f"user_{user_id}"}
