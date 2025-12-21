"""Tests for pyan wrapper."""

from __future__ import annotations

from pathlib import Path

from codemap.analyzer.pyan_wrapper import CallGraph, PyanAnalyzer, SymbolMetadata


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
        # Verify nodes contain metadata
        assert len(result.nodes) > 0
        for qualified_name, metadata in result.nodes.items():
            assert isinstance(metadata, SymbolMetadata)
            assert metadata.qualified_name == qualified_name
            assert metadata.kind in ("module", "class", "function", "method")
            assert metadata.file.exists()
            assert metadata.line > 0


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
    metadata = SymbolMetadata(
        qualified_name="func1",
        kind="function",
        file=Path("test.py"),
        line=10,
    )
    graph = CallGraph(
        nodes={"func1": metadata},
        edges=[("func1", "func2")],
        files_analyzed=[Path("test.py")],
    )
    assert "func1" in graph.nodes
    assert graph.nodes["func1"].kind == "function"
    assert graph.edges == [("func1", "func2")]
    assert len(graph.files_analyzed) == 1


def test_symbol_metadata_creation() -> None:
    """Test SymbolMetadata dataclass creation."""
    metadata = SymbolMetadata(
        qualified_name="module.Class.method",
        kind="method",
        file=Path("src/module.py"),
        line=42,
        docstring="Test method docstring",
    )
    assert metadata.qualified_name == "module.Class.method"
    assert metadata.kind == "method"
    assert metadata.file == Path("src/module.py")
    assert metadata.line == 42
    assert metadata.docstring == "Test method docstring"


def test_analyze_files_metadata_extraction() -> None:
    """Test that analyze_files correctly extracts metadata for symbols."""
    analyzer = PyanAnalyzer()
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"

    if fixture_file.exists():
        result = analyzer.analyze_files([fixture_file])

        # Check that we extracted the expected symbols with correct kinds
        expected_symbols = {
            "tests.fixtures.sample_module": "module",
            "tests.fixtures.sample_module.helper_function": "function",
            "tests.fixtures.sample_module.SampleClass": "class",
            "tests.fixtures.sample_module.SampleClass.method_one": "method",
            "tests.fixtures.sample_module.SampleClass.method_two": "method",
        }

        for qualified_name, expected_kind in expected_symbols.items():
            assert qualified_name in result.nodes
            metadata = result.nodes[qualified_name]
            assert metadata.kind == expected_kind
            assert metadata.file == fixture_file
            assert metadata.line > 0
