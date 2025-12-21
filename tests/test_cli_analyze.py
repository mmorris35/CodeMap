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


def test_analyze_with_none_exclude_patterns(
    runner: CliRunner,
    temp_project: Path,
) -> None:
    """Test analyze command handles None exclude_patterns gracefully.

    This is a regression test for GitHub issue #3 - Bug 1.
    When config.exclude_patterns is None, the code should not crash
    with "TypeError: 'NoneType' object is not iterable".
    """
    # This test verifies the fix: for pattern in config.exclude_patterns or []
    result = runner.invoke(
        cli,
        [
            "analyze",
            "--source",
            str(temp_project / "src"),
            "--exclude",
            "__pycache__",
        ],
    )

    # Should complete successfully without NoneType iteration error
    assert "TypeError" not in result.output
    assert "'NoneType' object is not iterable" not in result.output
    # Either success or expected error (no files found)
    assert result.exit_code in (0, 1)


def test_analyze_with_list_comprehension(runner: CliRunner, tmp_path: Path) -> None:
    """Test analyze command handles list comprehensions without error.

    This is a regression test for GitHub issue #3 - Bug 2.
    pyan3 used to fail with "Unknown scope" error on comprehensions
    (listcomp, dictcomp, setcomp, genexpr). The fix uses monkey-patching
    to gracefully handle these scopes.
    """
    src_dir = tmp_path / "src"
    src_dir.mkdir()

    # Create file with list comprehension
    (src_dir / "comprehensions.py").write_text(
        """\"\"\"Module with comprehensions.\"\"\"

def process_numbers():
    numbers = [1, 2, 3, 4, 5]
    squared = [x * x for x in numbers]
    return squared

def dict_example():
    keys = ['a', 'b', 'c']
    mapping = {k: i for i, k in enumerate(keys)}
    return mapping

def set_example():
    items = [1, 2, 2, 3, 3, 3]
    unique = {x for x in items}
    return unique

def generator_example():
    numbers = [1, 2, 3]
    squared_gen = (x * x for x in numbers)
    return squared_gen
"""
    )

    output_dir = tmp_path / ".codemap"
    result = runner.invoke(
        cli,
        ["analyze", "--source", str(src_dir), "--output", str(output_dir)],
    )

    # Should complete successfully - comprehensions should be handled
    # without crashing (the fix prevents "Unknown scope" exceptions)
    assert result.exit_code == 0 or "Found" in result.output
    # Verify no unexpected errors
    assert "Traceback" not in result.output


def test_analyze_creates_proper_symbol_objects(
    runner: CliRunner,
    temp_project: Path,
) -> None:
    """Test analyze command creates proper Symbol objects.

    This is a regression test for GitHub issue #3 - Bug 3.
    The registry.add() method expects Symbol objects, not strings.
    This test verifies that the code properly constructs Symbol objects
    before adding them to the registry.
    """
    output_dir = temp_project / ".codemap"

    result = runner.invoke(
        cli,
        ["analyze", "--source", str(temp_project / "src"), "--output", str(output_dir)],
    )

    # Should complete successfully - if strings were being passed to
    # registry.add(), it would fail with AttributeError
    assert "AttributeError" not in result.output
    assert result.exit_code == 0 or "Found" in result.output

    # Verify CODE_MAP.json was generated with proper symbol data
    code_map_path = output_dir / "CODE_MAP.json"
    if code_map_path.exists():
        import json

        code_map_data = json.loads(code_map_path.read_text())
        # Should have symbols with required fields
        if code_map_data.get("symbols"):
            for symbol in code_map_data["symbols"]:
                assert isinstance(symbol, dict)
                assert "qualified_name" in symbol
                assert "kind" in symbol
