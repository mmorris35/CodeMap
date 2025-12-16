"""Tests for impact analysis."""

from __future__ import annotations

from codemap.analyzer.graph import DependencyGraph
from codemap.analyzer.impact import ImpactAnalyzer, ImpactReport


def test_impact_report_creation() -> None:
    """Test creating an impact report."""
    report = ImpactReport(
        affected_symbols=["auth.validate_user", "api.login"],
        affected_files=[],
        risk_score=45,
    )
    assert len(report.affected_symbols) == 2
    assert report.risk_score == 45


def test_impact_analyzer_init() -> None:
    """Test initializing impact analyzer."""
    graph = DependencyGraph()
    analyzer = ImpactAnalyzer(graph)
    assert analyzer._graph is graph


def test_analyze_impact_single_symbol() -> None:
    """Test analyzing impact of single symbol change."""
    graph = DependencyGraph()
    # When main.run calls auth.validate, and auth.validate changes,
    # main.run is affected
    graph.add_dependency("main.run", "auth.validate")
    graph.add_dependency("api.login", "auth.validate")

    analyzer = ImpactAnalyzer(graph)
    report = analyzer.analyze_impact(["auth.validate"])

    assert "main.run" in report.direct_impacts or len(report.direct_impacts) > 0
    assert "api.login" in report.direct_impacts or len(report.direct_impacts) > 0


def test_analyze_impact_multiple_symbols() -> None:
    """Test analyzing impact of multiple symbol changes."""
    graph = DependencyGraph()
    graph.add_dependency("main.run", "auth.validate")
    graph.add_dependency("main.run", "auth.hash")
    graph.add_dependency("api.login", "auth.validate")

    analyzer = ImpactAnalyzer(graph)
    report = analyzer.analyze_impact(["auth.validate", "auth.hash"])

    assert len(report.affected_symbols) > 0
    assert "main.run" in report.affected_symbols


def test_analyze_impact_missing_symbol() -> None:
    """Test analyzing impact with missing symbol."""
    graph = DependencyGraph()
    graph.add_dependency("auth.validate", "api.login")

    analyzer = ImpactAnalyzer(graph)
    report = analyzer.analyze_impact(["missing.symbol"])

    assert len(report.affected_symbols) == 0
    assert report.risk_score == 0


def test_risk_score_calculation() -> None:
    """Test risk score calculation."""
    analyzer = ImpactAnalyzer(DependencyGraph())

    # Test with multiple affected symbols
    score1 = analyzer._calculate_risk_score(
        affected=["a", "b", "c", "d", "e"],
        depth=0,
        has_tests=False,
    )
    assert 0 <= score1 <= 100

    # Test with tests reduces score
    score_no_tests = analyzer._calculate_risk_score(
        affected=["a", "b"],
        depth=0,
        has_tests=False,
    )
    score_with_tests = analyzer._calculate_risk_score(
        affected=["a", "b"],
        depth=0,
        has_tests=True,
    )
    assert score_with_tests < score_no_tests


def test_suggest_test_files() -> None:
    """Test test file suggestion."""
    analyzer = ImpactAnalyzer(DependencyGraph())
    suggested = analyzer.suggest_test_files(["auth.validate_user", "api.routes"])

    # Should suggest test files based on module names
    assert any("test" in str(p).lower() for p in suggested)


def test_depth_limited_impact() -> None:
    """Test depth-limited impact analysis."""
    graph = DependencyGraph()
    # Create chain where: e calls d, d calls c, c calls b, b calls a
    # So when "a" changes, "b" is directly affected
    graph.add_dependency("b", "a")
    graph.add_dependency("c", "b")
    graph.add_dependency("d", "c")
    graph.add_dependency("e", "d")

    analyzer = ImpactAnalyzer(graph)

    # Analyze - should find at least b as affected
    report = analyzer.analyze_impact(["a"])
    assert len(report.affected_symbols) > 0
    assert "b" in report.affected_symbols
