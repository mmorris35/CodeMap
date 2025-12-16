"""Database query functions."""

from __future__ import annotations

import logging
from typing import Any

from db.connection import close_connection, get_connection

logger = logging.getLogger(__name__)

# Mock database data
_users_db: dict[str, dict[str, Any]] = {}
_todos_db: dict[str, dict[str, Any]] = {}


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    """Get user by ID.

    Args:
        user_id: User ID to retrieve.

    Returns:
        User record or None if not found.
    """
    _conn = get_connection()  # noqa: F841
    try:
        logger.debug("Querying user: %s", user_id)
        result = _users_db.get(user_id)
        return result
    finally:
        close_connection()


def get_user_by_email(email: str) -> dict[str, Any] | None:
    """Get user by email.

    Args:
        email: User email to retrieve.

    Returns:
        User record or None if not found.
    """
    _conn = get_connection()  # noqa: F841
    try:
        logger.debug("Querying user by email: %s", email)
        for user in _users_db.values():
            if user.get("email") == email:
                return user
        return None
    finally:
        close_connection()


def get_todos_by_user(user_id: str) -> list[dict[str, Any]]:
    """Get all todos for a user.

    Args:
        user_id: User ID.

    Returns:
        List of todo records.
    """
    _conn = get_connection()  # noqa: F841
    try:
        logger.debug("Querying todos for user: %s", user_id)
        todos = [t for t in _todos_db.values() if t.get("user_id") == user_id]
        return todos
    finally:
        close_connection()


def insert_todo(
    user_id: str,
    title: str,
    description: str = "",
) -> dict[str, Any]:
    """Insert a new todo.

    Args:
        user_id: User ID.
        title: Todo title.
        description: Optional todo description.

    Returns:
        Created todo record.
    """
    _conn = get_connection()  # noqa: F841
    try:
        todo_id = f"todo_{len(_todos_db) + 1}"
        todo = {
            "id": todo_id,
            "user_id": user_id,
            "title": title,
            "description": description,
            "completed": False,
        }
        _todos_db[todo_id] = todo
        logger.info("Inserted todo: %s for user: %s", todo_id, user_id)
        return todo
    finally:
        close_connection()


def update_todo(todo_id: str, **kwargs: Any) -> dict[str, Any] | None:
    """Update a todo.

    Args:
        todo_id: Todo ID.
        **kwargs: Fields to update.

    Returns:
        Updated todo record or None if not found.
    """
    _conn = get_connection()  # noqa: F841
    try:
        if todo_id not in _todos_db:
            return None

        todo = _todos_db[todo_id]
        todo.update(kwargs)
        logger.info("Updated todo: %s", todo_id)
        return todo
    finally:
        close_connection()
