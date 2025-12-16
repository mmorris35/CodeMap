"""Tests for pyan wrapper."""

from __future__ import annotations

from pathlib import Path

from codemap.analyzer.pyan_wrapper import CallGraph, PyanAnalyzer


def test_pyan_analyzer_init() -> None:
    """Test analyzer initialization."""
    analyzer = PyanAnalyzer()
    assert analyzer.exclude_patterns is not None
    assert "__pycache__" in analyzer.exclude_patterns


def test_pyan_analyzer_custom_patterns() -> None:
    """Test analyzer with custom exclude patterns."""
    patterns = ["test_*", "build"]
    analyzer = PyanAnalyzer(exclude_patterns=patterns)
    assert analyzer.exclude_patterns == patterns


def test_analyze_files_empty() -> None:
    """Test analyzing empty file list."""
    analyzer = PyanAnalyzer()
    result = analyzer.analyze_files([])
    assert isinstance(result, CallGraph)
    assert result.nodes == {}
    assert result.edges == []
    assert result.files_analyzed == []


def test_analyze_files_single_file() -> None:
    """Test analyzing a single file."""
    analyzer = PyanAnalyzer()
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"

    if fixture_file.exists():
        result = analyzer.analyze_files([fixture_file])
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [fixture_file]


def test_file_filtering() -> None:
    """Test file filtering with exclusion patterns."""
    analyzer = PyanAnalyzer(exclude_patterns=["__pycache__", "test_"])

    files = [
        Path("src/module.py"),
        Path("__pycache__/module.cpython-39.pyc"),
        Path("tests/test_module.py"),
        Path("src/utils.py"),
    ]

    filtered = analyzer._filter_files(files)
    assert Path("src/module.py") in filtered
    assert Path("src/utils.py") in filtered
    assert len(filtered) == 2


def test_should_exclude() -> None:
    """Test exclusion logic."""
    analyzer = PyanAnalyzer(exclude_patterns=["__pycache__", ".venv"])

    assert analyzer._should_exclude(Path("__pycache__/module.pyc"))
    assert analyzer._should_exclude(Path(".venv/lib/python.py"))
    assert not analyzer._should_exclude(Path("src/module.py"))


def test_call_graph_structure() -> None:
    """Test CallGraph dataclass structure."""
    graph = CallGraph(
        nodes={"func1": {"node": "func1"}},
        edges=[("func1", "func2")],
        files_analyzed=[Path("test.py")],
    )
    assert graph.nodes == {"func1": {"node": "func1"}}
    assert graph.edges == [("func1", "func2")]
    assert len(graph.files_analyzed) == 1
