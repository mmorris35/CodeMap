"""Tests for CLI entry point."""

from __future__ import annotations

from click.testing import CliRunner

from codemap import __version__
from codemap.cli import cli


def test_cli_version() -> None:
    """Test that --version outputs the correct version."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert __version__ in result.output


def test_cli_help() -> None:
    """Test that --help outputs usage information."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "CodeMap" in result.output
    assert "--verbose" in result.output
    assert "--quiet" in result.output


def test_cli_verbose_flag() -> None:
    """Test that --verbose/-v flag is recognized."""
    runner = CliRunner()
    result = runner.invoke(cli, ["-v", "--help"])
    assert result.exit_code == 0


def test_cli_quiet_flag() -> None:
    """Test that --quiet/-q flag is recognized."""
    runner = CliRunner()
    result = runner.invoke(cli, ["-q", "--help"])
    assert result.exit_code == 0


def test_cli_no_args() -> None:
    """Test that CLI with no args shows help or usage error."""
    runner = CliRunner()
    result = runner.invoke(cli, [])
    # Click groups without a default show usage error (exit code 2)
    assert result.exit_code in (0, 2)
    assert "Usage" in result.output or "CodeMap" in result.output
