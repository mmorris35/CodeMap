"""API middleware for authentication and error handling."""

from __future__ import annotations

import logging
from functools import wraps
from typing import TYPE_CHECKING, Any

from auth import verify_token
from flask import jsonify, request

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)


def auth_required(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator to require authentication for an endpoint.

    Args:
        func: Flask view function to wrap.

    Returns:
        Wrapped function that requires auth.
    """

    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        logger.debug("Checking authentication")
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            logger.warning("Missing or invalid Authorization header")
            return jsonify({"error": "Unauthorized"}), 401

        token = auth_header[7:]  # Remove "Bearer " prefix
        payload = verify_token(token)

        if not payload:
            logger.warning("Invalid token")
            return jsonify({"error": "Invalid token"}), 401

        # Store user info in request context
        request.user_id = payload.get("user_id")
        request.user_email = payload.get("email")

        return func(*args, **kwargs)

    return wrapper


def error_handler(error: Exception) -> tuple[dict[str, Any], int]:
    """Global error handler for Flask.

    Args:
        error: Exception that occurred.

    Returns:
        JSON error response and status code.
    """
    logger.error("Application error: %s", error)

    return (
        jsonify({"error": "Internal server error"}),
        500,
    )
