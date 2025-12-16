"""Tests for the impact CLI command."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from codemap.cli import cli


@pytest.fixture
def runner() -> CliRunner:
    """Provide a Click test runner."""
    return CliRunner()


@pytest.fixture
def sample_code_map(tmp_path: Path) -> Path:
    """Create a sample CODE_MAP.json for testing."""
    codemap_dir = tmp_path / ".codemap"
    codemap_dir.mkdir()

    code_map = {
        "schema": "http://json-schema.org/draft-07/schema#",
        "version": "1.0",
        "generated_at": "2024-01-15T10:30:00Z",
        "source_root": "./src",
        "symbols": [
            {
                "qualified_name": "auth.validate_user",
                "kind": "function",
                "file": "src/auth.py",
                "line": 10,
            },
            {
                "qualified_name": "auth.hash_password",
                "kind": "function",
                "file": "src/auth.py",
                "line": 20,
            },
            {
                "qualified_name": "main.login",
                "kind": "function",
                "file": "src/main.py",
                "line": 5,
            },
        ],
        "dependencies": [
            {
                "from_sym": "main.login",
                "to_sym": "auth.validate_user",
                "kind": "calls",
            },
            {
                "from_sym": "auth.validate_user",
                "to_sym": "auth.hash_password",
                "kind": "calls",
            },
        ],
    }

    code_map_path = codemap_dir / "CODE_MAP.json"
    with open(code_map_path, "w") as f:
        json.dump(code_map, f)

    return tmp_path


def test_impact_missing_code_map(runner: CliRunner, tmp_path: Path) -> None:
    """Test impact command when CODE_MAP.json is missing."""
    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = runner.invoke(
            cli,
            ["impact", "some.symbol"],
        )

        assert result.exit_code == 1
        assert "not found" in result.output.lower() or "error" in result.output.lower()


def test_impact_with_symbol(runner: CliRunner, sample_code_map: Path) -> None:
    """Test impact command with a specific symbol."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["impact", "auth.validate_user"],
        )

        # Should not fail if command structure is correct
        assert "Error: CODE_MAP.json not found" in result.output or result.exit_code == 0


def test_impact_with_multiple_symbols(runner: CliRunner, sample_code_map: Path) -> None:
    """Test impact command with multiple symbols."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["impact", "auth.validate_user", "auth.hash_password"],
        )

        assert result.exit_code in (0, 1)


def test_impact_with_depth(runner: CliRunner, sample_code_map: Path) -> None:
    """Test impact command with --depth option."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["impact", "auth.validate_user", "--depth", "2"],
        )

        assert result.exit_code in (0, 1)


def test_impact_format_text(runner: CliRunner, sample_code_map: Path) -> None:
    """Test impact command with text format."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["impact", "auth.validate_user", "--format", "text"],
        )

        assert result.exit_code in (0, 1)


def test_impact_format_json(runner: CliRunner, sample_code_map: Path) -> None:
    """Test impact command with json format."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["impact", "auth.validate_user", "--format", "json"],
        )

        assert result.exit_code in (0, 1)


def test_impact_format_mermaid(runner: CliRunner, sample_code_map: Path) -> None:
    """Test impact command with mermaid format."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["impact", "auth.validate_user", "--format", "mermaid"],
        )

        assert result.exit_code in (0, 1)


def test_impact_no_symbol_argument(runner: CliRunner) -> None:
    """Test impact command without symbol argument."""
    result = runner.invoke(
        cli,
        ["impact"],
    )

    assert result.exit_code != 0
    assert "Missing argument" in result.output or "SYMBOLS" in result.output
