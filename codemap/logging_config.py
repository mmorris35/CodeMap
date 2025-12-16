"""Centralized logging configuration for CodeMap."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def setup_logging(
    level: str = "INFO",
    log_file: Path | None = None,
) -> None:
    """Set up centralized logging configuration.

    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR).
        log_file: Optional path to write logs to a file.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Console handler with timestamp and level
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Format with timestamp, level, module, and message
    formatter = logging.Formatter(
        fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler if path provided
    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)


def get_logger(name: str) -> logging.Logger:
    """Get a named logger instance.

    Args:
        name: The logger name, typically __name__.

    Returns:
        A configured logger instance.
    """
    return logging.getLogger(name)
