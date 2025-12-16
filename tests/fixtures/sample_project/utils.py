"""Utility functions for sample project."""

from __future__ import annotations

from datetime import datetime


def format_timestamp(timestamp: datetime | None = None) -> str:
    """Format a timestamp to ISO format.

    Args:
        timestamp: The timestamp to format. If None, uses current time.

    Returns:
        ISO formatted timestamp string.
    """
    if timestamp is None:
        timestamp = datetime.now()
    return timestamp.isoformat()


def is_valid_username(username: str) -> bool:
    """Validate username format.

    Args:
        username: The username to validate.

    Returns:
        True if valid, False otherwise.
    """
    return len(username) > 3 and username.isalnum()
