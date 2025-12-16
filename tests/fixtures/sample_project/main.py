"""Main entry point for sample application."""

from __future__ import annotations

from auth import get_user, validate_user
from database import get_database
from utils import format_timestamp


def login(username: str, password: str) -> dict[str, object] | None:
    """Authenticate user and log them in.

    Calls validate_user from auth module to check credentials,
    then retrieves user data and logs the login timestamp.

    Args:
        username: The username to authenticate.
        password: The password to authenticate.

    Returns:
        User data dictionary if successful, None otherwise.
    """
    if not validate_user(username, password):
        return None

    # Get user data
    user_data = get_user(1)
    if user_data:
        user_data["login_time"] = format_timestamp()
        return user_data  # type: ignore[no-any-return]

    return None


def create_account(username: str, password: str) -> bool:
    """Create a new user account.

    Creates account by storing data in database, calls hash_password
    from auth module, and logs creation timestamp.

    Args:
        username: The username for new account.
        password: The password for new account.

    Returns:
        True if account created successfully.
    """
    from auth import hash_password

    database = get_database()
    hashed = hash_password(password)
    timestamp = format_timestamp()

    data: dict[str, object] = {
        "username": username,
        "password_hash": hashed,
        "created_at": timestamp,
    }
    result = database.insert("users", data)
    database.close()

    return result > 0  # type: ignore[no-any-return]


def list_users() -> list[dict[str, object]] | None:
    """List all users from database.

    Args:
        None

    Returns:
        List of user dictionaries from database.
    """
    database = get_database()
    users = database.execute_query("SELECT * FROM users")
    database.close()
    return users  # type: ignore[no-any-return]


def main() -> None:
    """Main application entry point."""
    user = login("alice", "password123")
    if user:
        print(f"Logged in: {user}")
    else:
        print("Login failed")


if __name__ == "__main__":
    main()
