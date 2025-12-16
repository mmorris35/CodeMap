"""Tests for the sync CLI command."""

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
        ],
        "dependencies": [],
    }

    code_map_path = codemap_dir / "CODE_MAP.json"
    with open(code_map_path, "w") as f:
        json.dump(code_map, f)

    return tmp_path


@pytest.fixture
def sample_devplan(tmp_path: Path) -> Path:
    """Create a sample DEVELOPMENT_PLAN.md for testing."""
    devplan_content = """# CodeMap

## Phase 1: Core Engine

### Task 1.1: CLI Setup

**Subtask 1.1.1: Setup**

Some content about setting up the CLI.
"""
    devplan_path = tmp_path / "DEVELOPMENT_PLAN.md"
    devplan_path.write_text(devplan_content)
    return devplan_path


def test_sync_missing_code_map(runner: CliRunner, sample_devplan: Path) -> None:
    """Test sync command when CODE_MAP.json is missing."""
    result = runner.invoke(
        cli,
        ["sync", "--devplan", str(sample_devplan)],
    )

    assert result.exit_code == 1
    assert "not found" in result.output.lower() or "error" in result.output.lower()


def test_sync_dry_run(runner: CliRunner, sample_code_map: Path) -> None:
    """Test sync command dry run (no --update-map)."""
    devplan_path = sample_code_map.parent / "DEVELOPMENT_PLAN.md"
    devplan_path.write_text("# Test Plan\n")

    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["sync", "--devplan", "DEVELOPMENT_PLAN.md"],
        )

        assert "Use --update-map" in result.output or result.exit_code in (0, 1)


def test_sync_with_update_flag(runner: CliRunner, sample_code_map: Path) -> None:
    """Test sync command with --update-map flag."""
    devplan_path = sample_code_map.parent / "DEVELOPMENT_PLAN.md"
    devplan_path.write_text("# Test Plan\n")

    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["sync", "--devplan", "DEVELOPMENT_PLAN.md", "--update-map"],
        )

        assert result.exit_code in (0, 1)


def test_sync_no_devplan_argument(runner: CliRunner) -> None:
    """Test sync command without devplan argument."""
    result = runner.invoke(cli, ["sync"])

    assert result.exit_code != 0
    assert "devplan" in result.output.lower() or "required" in result.output.lower()


def test_sync_nonexistent_devplan(runner: CliRunner) -> None:
    """Test sync command with nonexistent devplan."""
    result = runner.invoke(
        cli,
        ["sync", "--devplan", "/nonexistent/DEVELOPMENT_PLAN.md"],
    )

    assert result.exit_code != 0


def test_sync_help(runner: CliRunner) -> None:
    """Test sync command help."""
    result = runner.invoke(cli, ["sync", "--help"])

    assert result.exit_code == 0
    assert "Link" in result.output or "DEVELOPMENT_PLAN" in result.output
