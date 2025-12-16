"""Flask Todo API application entry point."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from api.middleware import error_handler
from api.routes import api_blueprint
from db.connection import init_connection_pool
from flask import Flask

if TYPE_CHECKING:
    pass

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    """Create and configure Flask application.

    Returns:
        Configured Flask application instance.
    """
    app = Flask(__name__)

    # Initialize database
    logger.info("Initializing database connection pool")
    init_connection_pool()

    # Register error handler
    app.register_error_handler(Exception, error_handler)

    # Register blueprints
    app.register_blueprint(api_blueprint)

    logger.info("Application initialized successfully")
    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)
