"""Database module for sample project."""

from __future__ import annotations

from typing import Any


class Database:
    """Simple database abstraction."""

    def __init__(self, connection_string: str) -> None:
        """Initialize database connection.

        Args:
            connection_string: The database connection string.
        """
        self.connection_string = connection_string

    def execute_query(self, query: str) -> list[dict[str, Any]]:
        """Execute a database query.

        Args:
            query: The SQL query to execute.

        Returns:
            List of result rows.
        """
        return []

    def insert(self, table: str, data: dict[str, Any]) -> int:
        """Insert data into a table.

        Args:
            table: The table name.
            data: The data to insert.

        Returns:
            The ID of the inserted row.
        """
        return 1

    def close(self) -> None:
        """Close database connection."""
        pass


def get_database() -> Database:
    """Get a database connection.

    Returns:
        A Database instance.
    """
    return Database("sqlite:///:memory:")
