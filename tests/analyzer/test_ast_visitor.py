"""Tests for AST visitor."""

from __future__ import annotations

from pathlib import Path

from codemap.analyzer.ast_visitor import analyze_file


def test_analyze_sample_module() -> None:
    """Test analyzing sample module."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"
    result = analyze_file(fixture_file)

    assert "functions" in result
    assert "classes" in result
    assert len(result["functions"]) > 0
    assert len(result["classes"]) > 0


def test_function_extraction() -> None:
    """Test function definition extraction."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"
    result = analyze_file(fixture_file)

    functions = result["functions"]
    func_names = [f.name for f in functions]
    assert "helper_function" in func_names


def test_class_extraction() -> None:
    """Test class definition extraction."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"
    result = analyze_file(fixture_file)

    classes = result["classes"]
    class_names = [c.name for c in classes]
    assert "SampleClass" in class_names


def test_method_extraction() -> None:
    """Test method extraction from classes."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"
    result = analyze_file(fixture_file)

    classes = result["classes"]
    sample_class = next((c for c in classes if c.name == "SampleClass"), None)
    assert sample_class is not None
    assert "method_one" in sample_class.methods
    assert "method_two" in sample_class.methods


def test_import_extraction() -> None:
    """Test import statement extraction."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_caller.py"
    result = analyze_file(fixture_file)

    imports = result["imports"]
    assert len(imports) > 0


def test_qualified_names() -> None:
    """Test qualified name generation for methods."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"
    result = analyze_file(fixture_file)

    functions = result["functions"]
    qualified_names = [f.qualname for f in functions]
    assert any("SampleClass" in qn for qn in qualified_names)


def test_docstring_extraction() -> None:
    """Test docstring extraction."""
    fixture_file = Path(__file__).parent.parent / "fixtures" / "sample_module.py"
    result = analyze_file(fixture_file)

    functions = result["functions"]
    helper_func = next((f for f in functions if f.name == "helper_function"), None)
    assert helper_func is not None
    assert helper_func.docstring is not None


def test_syntax_error_handling() -> None:
    """Test handling of syntax errors."""
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write("def broken(\n    # Missing closing paren")
        f.flush()
        result = analyze_file(Path(f.name))

    assert result["functions"] == []
    assert result["classes"] == []
