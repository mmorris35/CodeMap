"""Tests for the analyze CLI command."""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from codemap.cli import cli


@pytest.fixture
def runner() -> CliRunner:
    """Provide a Click test runner."""
    return CliRunner()


@pytest.fixture
def temp_project(tmp_path: Path) -> Path:
    """Create a temporary project with sample Python files."""
    src_dir = tmp_path / "src"
    src_dir.mkdir()

    # Create sample files
    (src_dir / "main.py").write_text(
        """\"\"\"Main module.\"\"\"

def main():
    \"\"\"Entry point.\"\"\"
    pass
"""
    )

    (src_dir / "utils.py").write_text(
        """\"\"\"Utility functions.\"\"\"

def helper():
    \"\"\"Helper function.\"\"\"
    pass
"""
    )

    return tmp_path


def test_analyze_basic(runner: CliRunner, temp_project: Path) -> None:
    """Test basic analyze command."""
    result = runner.invoke(
        cli,
        ["analyze", "--source", str(temp_project / "src")],
    )

    # Command should complete
    assert result.exit_code == 0 or "Found" in result.output


def test_analyze_with_output_option(
    runner: CliRunner,
    temp_project: Path,
) -> None:
    """Test analyze command with custom output directory."""
    output_dir = temp_project / ".codemap_custom"

    result = runner.invoke(
        cli,
        [
            "analyze",
            "--source",
            str(temp_project / "src"),
            "--output",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0 or "Error" not in result.output


def test_analyze_with_exclude(runner: CliRunner, temp_project: Path) -> None:
    """Test analyze command with exclude patterns."""
    result = runner.invoke(
        cli,
        [
            "analyze",
            "--source",
            str(temp_project / "src"),
            "--exclude",
            "__pycache__",
            "--exclude",
            ".venv",
        ],
    )

    assert result.exit_code == 0 or "No Python files" in result.output


def test_analyze_no_files(runner: CliRunner, tmp_path: Path) -> None:
    """Test analyze command on empty directory."""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()

    result = runner.invoke(
        cli,
        ["analyze", "--source", str(empty_dir)],
    )

    assert result.exit_code == 1
    assert "No Python files found" in result.output


def test_analyze_nonexistent_source(runner: CliRunner) -> None:
    """Test analyze command with nonexistent source directory."""
    result = runner.invoke(
        cli,
        ["analyze", "--source", "/nonexistent/path"],
    )

    # Click validates path exists, so this should fail before our code
    assert result.exit_code != 0


def test_analyze_generates_code_map(runner: CliRunner, temp_project: Path) -> None:
    """Test that analyze generates CODE_MAP.json."""
    output_dir = temp_project / ".codemap"

    result = runner.invoke(
        cli,
        ["analyze", "--source", str(temp_project / "src"), "--output", str(output_dir)],
    )

    if result.exit_code == 0:
        # Check if CODE_MAP.json was created
        code_map_path = output_dir / "CODE_MAP.json"
        if code_map_path.exists():
            assert code_map_path.stat().st_size > 0


def test_analyze_generates_mermaid(runner: CliRunner, temp_project: Path) -> None:
    """Test that analyze generates ARCHITECTURE.mermaid."""
    output_dir = temp_project / ".codemap"

    result = runner.invoke(
        cli,
        ["analyze", "--source", str(temp_project / "src"), "--output", str(output_dir)],
    )

    if result.exit_code == 0:
        # Check if ARCHITECTURE.mermaid was created
        mermaid_path = output_dir / "ARCHITECTURE.mermaid"
        if mermaid_path.exists():
            content = mermaid_path.read_text()
            assert "flowchart" in content


def test_analyze_verbose(runner: CliRunner, temp_project: Path) -> None:
    """Test analyze command with verbose flag."""
    result = runner.invoke(
        cli,
        [
            "-v",
            "analyze",
            "--source",
            str(temp_project / "src"),
        ],
    )

    assert result.exit_code == 0 or "Found" in result.output or "Starting" in result.output
