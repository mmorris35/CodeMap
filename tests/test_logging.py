"""Tests for logging configuration."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from codemap.logging_config import get_logger, setup_logging


def test_setup_logging_console() -> None:
    """Test console logging configuration."""
    setup_logging(level="DEBUG")
    root_logger = logging.getLogger()
    assert root_logger.level == logging.DEBUG


def test_setup_logging_with_file() -> None:
    """Test logging to file."""
    with tempfile.TemporaryDirectory() as temp_dir:
        log_file = Path(temp_dir) / "test.log"
        setup_logging(level="INFO", log_file=log_file)

        logger = get_logger("test_module")
        logger.info("Test message")

        assert log_file.exists()
        content = log_file.read_text()
        assert "Test message" in content


def test_get_logger() -> None:
    """Test getting a named logger."""
    setup_logging()
    logger = get_logger("codemap.analyzer")
    assert logger.name == "codemap.analyzer"
    assert isinstance(logger, logging.Logger)


def test_log_format() -> None:
    """Test that log format includes required components."""
    with tempfile.TemporaryDirectory() as temp_dir:
        log_file = Path(temp_dir) / "format_test.log"
        setup_logging(level="INFO", log_file=log_file)

        logger = get_logger("test_module")
        logger.info("Format test")

        content = log_file.read_text()
        # Check for timestamp, level, module name, and message
        assert "T" in content  # ISO format timestamp
        assert "INFO" in content
        assert "test_module" in content
        assert "Format test" in content


def test_log_levels() -> None:
    """Test different log levels."""
    setup_logging(level="WARNING")
    root_logger = logging.getLogger()
    assert root_logger.level == logging.WARNING

    setup_logging(level="DEBUG")
    assert root_logger.level == logging.DEBUG

    setup_logging(level="ERROR")
    assert root_logger.level == logging.ERROR
