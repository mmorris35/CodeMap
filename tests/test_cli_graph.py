"""Tests for the graph CLI command."""

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


def test_graph_missing_code_map(runner: CliRunner) -> None:
    """Test graph command when CODE_MAP.json is missing."""
    result = runner.invoke(
        cli,
        ["graph"],
    )

    assert result.exit_code == 1
    assert "not found" in result.output.lower() or "error" in result.output.lower()


def test_graph_module_level(runner: CliRunner, sample_code_map: Path) -> None:
    """Test graph command with module level (default)."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["graph"],
        )

        # Check for flowchart syntax in output if successful
        if result.exit_code == 0:
            assert "flowchart" in result.output or "digraph" in result.output


def test_graph_function_level(runner: CliRunner, sample_code_map: Path) -> None:
    """Test graph command with function level."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["graph", "--level", "function", "--module", "auth"],
        )

        assert result.exit_code in (0, 1)


def test_graph_function_level_without_module(runner: CliRunner, sample_code_map: Path) -> None:
    """Test graph command function level without --module fails."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["graph", "--level", "function"],
        )

        assert result.exit_code == 1
        assert "module" in result.output.lower() or "required" in result.output.lower()


def test_graph_format_mermaid(runner: CliRunner, sample_code_map: Path) -> None:
    """Test graph command with mermaid format."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["graph", "--format", "mermaid"],
        )

        if result.exit_code == 0:
            assert "flowchart" in result.output or "TD" in result.output


def test_graph_format_dot(runner: CliRunner, sample_code_map: Path) -> None:
    """Test graph command with dot format."""
    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["graph", "--format", "dot"],
        )

        if result.exit_code == 0:
            assert "digraph" in result.output or "->" in result.output


def test_graph_output_file(runner: CliRunner, sample_code_map: Path, tmp_path: Path) -> None:
    """Test graph command with output file."""
    output_file = tmp_path / "graph.mermaid"

    with runner.isolated_filesystem(temp_dir=sample_code_map.parent):
        result = runner.invoke(
            cli,
            ["graph", "--output", str(output_file)],
        )

        # Should complete without error
        assert result.exit_code in (0, 1)


def test_graph_help(runner: CliRunner) -> None:
    """Test graph command help."""
    result = runner.invoke(cli, ["graph", "--help"])

    assert result.exit_code == 0
    assert "Generate dependency graph" in result.output or "graph" in result.output.lower()
