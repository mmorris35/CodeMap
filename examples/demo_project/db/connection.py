"""Database connection pool management."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Global connection pool (in real app, use proper connection pool library)
_connection_pool: dict[str, Any] | None = None


def init_connection_pool(
    host: str = "localhost",
    database: str = "todos",
    pool_size: int = 10,
) -> None:
    """Initialize database connection pool.

    Args:
        host: Database host.
        database: Database name.
        pool_size: Number of connections in pool.
    """
    global _connection_pool

    logger.info(
        "Initializing connection pool: host=%s, db=%s, pool_size=%d",
        host,
        database,
        pool_size,
    )

    _connection_pool = {
        "host": host,
        "database": database,
        "pool_size": pool_size,
        "active_connections": 0,
    }


def get_connection() -> dict[str, Any]:
    """Get a database connection from the pool.

    Returns:
        Database connection object.

    Raises:
        RuntimeError: If connection pool not initialized.
    """
    if _connection_pool is None:
        raise RuntimeError("Connection pool not initialized")

    _connection_pool["active_connections"] += 1
    logger.debug("Got connection, active: %d", _connection_pool["active_connections"])
    return _connection_pool


def close_connection() -> None:
    """Return connection to the pool."""
    if _connection_pool is not None:
        _connection_pool["active_connections"] -= 1
        logger.debug("Returned connection, active: %d", _connection_pool["active_connections"])
