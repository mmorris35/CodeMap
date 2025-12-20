"""Tests for handling Python comprehensions in pyan_wrapper.

This module tests the graceful handling of list comprehensions, dict comprehensions,
set comprehensions, and generator expressions in the pyan_wrapper analyzer.
"""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from codemap.analyzer.pyan_wrapper import CallGraph, PyanAnalyzer


def test_pyan_analyzer_with_list_comprehension() -> None:
    """Test that pyan_wrapper handles list comprehensions gracefully.

    Creates a Python file with a list comprehension and verifies that
    the analyzer doesn't fail but instead logs a warning and continues.
    """
    code_with_listcomp = '''"""Module with list comprehension."""

def get_filtered_items(items):
    """Filter items using list comprehension."""
    return [x for x in items if x > 0]
'''

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        test_file = temp_path / "test_listcomp.py"
        test_file.write_text(code_with_listcomp)

        analyzer = PyanAnalyzer()
        result = analyzer.analyze_files([test_file])

        # Should return a CallGraph, not raise an error
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [test_file]
        # Should have some nodes (at least the module and function)
        assert len(result.nodes) > 0
        assert any("get_filtered_items" in node_name for node_name in result.nodes)


def test_pyan_analyzer_with_dict_comprehension() -> None:
    """Test that pyan_wrapper handles dict comprehensions gracefully.

    Creates a Python file with a dict comprehension and verifies that
    the analyzer doesn't fail but instead logs a warning and continues.
    """
    code_with_dictcomp = '''"""Module with dict comprehension."""

def build_map(keys, values):
    """Build a dictionary using dict comprehension."""
    return {k: v for k, v in zip(keys, values)}
'''

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        test_file = temp_path / "test_dictcomp.py"
        test_file.write_text(code_with_dictcomp)

        analyzer = PyanAnalyzer()
        result = analyzer.analyze_files([test_file])

        # Should return a CallGraph, not raise an error
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [test_file]
        # Should have some nodes (at least the module and function)
        assert len(result.nodes) > 0
        assert any("build_map" in node_name for node_name in result.nodes)


def test_pyan_analyzer_with_set_comprehension() -> None:
    """Test that pyan_wrapper handles set comprehensions gracefully.

    Creates a Python file with a set comprehension and verifies that
    the analyzer doesn't fail but instead logs a warning and continues.
    """
    code_with_setcomp = '''"""Module with set comprehension."""

def get_unique_squares(numbers):
    """Get unique squares using set comprehension."""
    return {x * x for x in numbers}
'''

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        test_file = temp_path / "test_setcomp.py"
        test_file.write_text(code_with_setcomp)

        analyzer = PyanAnalyzer()
        result = analyzer.analyze_files([test_file])

        # Should return a CallGraph, not raise an error
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [test_file]
        # Should have some nodes (at least the module and function)
        assert len(result.nodes) > 0
        assert any("get_unique_squares" in node_name for node_name in result.nodes)


def test_pyan_analyzer_with_generator_expression() -> None:
    """Test that pyan_wrapper handles generator expressions gracefully.

    Creates a Python file with a generator expression and verifies that
    the analyzer doesn't fail but instead logs a warning and continues.
    """
    code_with_genexpr = '''"""Module with generator expression."""

def lazy_double(numbers):
    """Double numbers using generator expression."""
    return (x * 2 for x in numbers)
'''

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        test_file = temp_path / "test_genexpr.py"
        test_file.write_text(code_with_genexpr)

        analyzer = PyanAnalyzer()
        result = analyzer.analyze_files([test_file])

        # Should return a CallGraph, not raise an error
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [test_file]
        # Should have some nodes (at least the module and function)
        assert len(result.nodes) > 0
        assert any("lazy_double" in node_name for node_name in result.nodes)


def test_pyan_analyzer_with_mixed_comprehensions() -> None:
    """Test that pyan_wrapper handles multiple comprehension types together.

    Creates a Python file with multiple comprehension types in the same
    function and verifies that the analyzer completes successfully.
    """
    code_with_mixed_comps = '''"""Module with mixed comprehensions."""

def process_data(data):
    """Process data with multiple comprehension types."""
    filtered = [x for x in data if x]
    mapped = {x: x * 2 for x in filtered}
    unique = {x % 10 for x in mapped.keys()}
    results = (x for x in unique)
    return list(results)
'''

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        test_file = temp_path / "test_mixed_comps.py"
        test_file.write_text(code_with_mixed_comps)

        analyzer = PyanAnalyzer()
        result = analyzer.analyze_files([test_file])

        # Should return a CallGraph, not raise an error
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [test_file]
        # Should have some nodes (at least the module and function)
        assert len(result.nodes) > 0
        assert any("process_data" in node_name for node_name in result.nodes)


def test_pyan_analyzer_with_nested_comprehensions() -> None:
    """Test that pyan_wrapper handles nested comprehensions gracefully.

    Creates a Python file with nested comprehensions and verifies that
    the analyzer completes successfully without errors.
    """
    code_with_nested_comps = '''"""Module with nested comprehensions."""

def flatten_and_filter(matrix):
    """Flatten and filter a matrix of numbers."""
    return [val for row in matrix for val in row if val > 0]
'''

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        test_file = temp_path / "test_nested_comps.py"
        test_file.write_text(code_with_nested_comps)

        analyzer = PyanAnalyzer()
        result = analyzer.analyze_files([test_file])

        # Should return a CallGraph, not raise an error
        assert isinstance(result, CallGraph)
        assert result.files_analyzed == [test_file]
        # Should have some nodes (at least the module and function)
        assert len(result.nodes) > 0
        assert any("flatten_and_filter" in node_name for node_name in result.nodes)


def test_demo_project_analyzes_without_error() -> None:
    """Test that the demo_project with list comprehensions analyzes successfully.

    This is an integration test that verifies the fix works on the actual
    demo_project which contains list comprehensions in db/queries.py.
    """
    demo_project_path = Path(__file__).parent.parent.parent / "examples" / "demo_project"

    if not demo_project_path.exists():
        pytest.skip("demo_project not found")

    analyzer = PyanAnalyzer()
    # Get all Python files from demo_project
    python_files = list(demo_project_path.glob("**/*.py"))
    assert len(python_files) > 0, "demo_project should have Python files"

    result = analyzer.analyze_files(python_files)

    # Should complete without raising an error
    assert isinstance(result, CallGraph)
    # Should have extracted symbols
    assert len(result.nodes) > 0, "Should have extracted symbols from demo_project"
    # Should have dependencies
    assert len(result.edges) > 0, "Should have extracted dependencies from demo_project"
    # The db.queries module should have been analyzed
    assert any(
        "db.queries" in node_name for node_name in result.nodes
    ), "Should have db.queries module symbols"
    # get_todos_by_user should be present
    assert any(
        "get_todos_by_user" in node_name for node_name in result.nodes
    ), "Should have get_todos_by_user function"
