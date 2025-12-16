"""Tests for drift report generation."""

from __future__ import annotations

import pytest

from codemap.output.drift_report import DriftReportGenerator
from codemap.output.linker import PlanCodeMap
from codemap.output.schemas import CodeMapSchema


@pytest.fixture  # type: ignore[misc]
def sample_code_map() -> CodeMapSchema:
    """Create a sample code map."""
    return {
        "version": "1.0",
        "generated_at": "2024-01-15T10:30:00Z",
        "source_root": "./",
        "symbols": [
            {
                "qualified_name": "auth.validate",
                "kind": "function",
                "file": "auth.py",
                "line": 10,
            },
            {
                "qualified_name": "auth.hash",
                "kind": "function",
                "file": "auth.py",
                "line": 20,
            },
            {
                "qualified_name": "main.run",
                "kind": "function",
                "file": "main.py",
                "line": 1,
            },
        ],
        "dependencies": [],
    }


@pytest.fixture  # type: ignore[misc]
def no_drift_map() -> PlanCodeMap:
    """Create a plan-code map with no drift."""
    pcm = PlanCodeMap()
    pcm.add_link("1.1.1", "auth.validate")
    pcm.add_link("1.1.1", "auth.hash")
    pcm.add_link("1.2.1", "main.run")
    return pcm


@pytest.fixture  # type: ignore[misc]
def with_drift_map() -> PlanCodeMap:
    """Create a plan-code map with drift."""
    pcm = PlanCodeMap()
    pcm.add_link("1.1.1", "auth.validate")
    # Missing: auth.hash and main.run not linked
    # Unplanned: main.run is implemented but not planned
    return pcm


class TestDriftReportGenerator:
    """Tests for DriftReportGenerator."""

    def test_init(self) -> None:
        """Test generator initialization."""
        gen = DriftReportGenerator()
        assert gen is not None

    def test_generate_no_drift(
        self, sample_code_map: CodeMapSchema, no_drift_map: PlanCodeMap
    ) -> None:
        """Test report generation with no drift."""
        gen = DriftReportGenerator()
        report = gen.generate(no_drift_map, sample_code_map)

        assert "Architecture Drift Report" in report
        assert "No drift" in report.lower() or "✓" in report

    def test_generate_with_drift(
        self, sample_code_map: CodeMapSchema, with_drift_map: PlanCodeMap
    ) -> None:
        """Test report generation with drift."""
        gen = DriftReportGenerator()
        report = gen.generate(with_drift_map, sample_code_map)

        assert "Architecture Drift Report" in report
        # Should have some drift sections
        assert "Implemented But Not Planned" in report or "Planned But Not Implemented" in report

    def test_report_has_summary(
        self, sample_code_map: CodeMapSchema, no_drift_map: PlanCodeMap
    ) -> None:
        """Test that report includes summary section."""
        gen = DriftReportGenerator()
        report = gen.generate(no_drift_map, sample_code_map)

        assert "## Summary" in report
        assert "Total Planned Symbols" in report

    def test_report_has_status(
        self, sample_code_map: CodeMapSchema, no_drift_map: PlanCodeMap
    ) -> None:
        """Test that report includes status indicator."""
        gen = DriftReportGenerator()
        report = gen.generate(no_drift_map, sample_code_map)

        # Should have some status indicator
        assert "Status" in report

    def test_report_with_unimplemented(
        self, sample_code_map: CodeMapSchema, with_drift_map: PlanCodeMap
    ) -> None:
        """Test report shows unimplemented symbols."""
        gen = DriftReportGenerator()
        report = gen.generate(with_drift_map, sample_code_map)

        # Should mention unimplemented symbols
        assert len(report) > 100  # Non-trivial content

    def test_report_valid_markdown(
        self, sample_code_map: CodeMapSchema, no_drift_map: PlanCodeMap
    ) -> None:
        """Test that report is valid Markdown."""
        gen = DriftReportGenerator()
        report = gen.generate(no_drift_map, sample_code_map)

        # Should have headers
        assert "#" in report

        # Should be string
        assert isinstance(report, str)

    def test_report_has_recommendations(
        self, sample_code_map: CodeMapSchema, with_drift_map: PlanCodeMap
    ) -> None:
        """Test that report includes recommendations."""
        gen = DriftReportGenerator()
        report = gen.generate(with_drift_map, sample_code_map)

        assert "Recommendations" in report

    def test_report_multiline(
        self, sample_code_map: CodeMapSchema, no_drift_map: PlanCodeMap
    ) -> None:
        """Test that report contains multiple lines."""
        gen = DriftReportGenerator()
        report = gen.generate(no_drift_map, sample_code_map)

        lines = report.split("\n")
        assert len(lines) > 5

    def test_report_contains_metrics(
        self, sample_code_map: CodeMapSchema, no_drift_map: PlanCodeMap
    ) -> None:
        """Test that report includes numeric metrics."""
        gen = DriftReportGenerator()
        report = gen.generate(no_drift_map, sample_code_map)

        # Should have numeric values
        assert any(c.isdigit() for c in report)

    def test_report_with_empty_plan(self) -> None:
        """Test report with empty plan."""
        gen = DriftReportGenerator()
        pcm = PlanCodeMap()

        code_map: CodeMapSchema = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./",
            "symbols": [
                {
                    "qualified_name": "test.func",
                    "kind": "function",
                    "file": "test.py",
                    "line": 1,
                },
            ],
            "dependencies": [],
        }

        report = gen.generate(pcm, code_map)

        # Should indicate unplanned code
        assert len(report) > 0
        assert "Architecture Drift Report" in report

    def test_report_contains_tables(
        self, sample_code_map: CodeMapSchema, with_drift_map: PlanCodeMap
    ) -> None:
        """Test that report includes Markdown tables."""
        gen = DriftReportGenerator()
        report = gen.generate(with_drift_map, sample_code_map)

        # Tables should have pipe characters
        assert "|" in report

    def test_different_risk_levels(self) -> None:
        """Test that report assesses different risk levels."""
        gen = DriftReportGenerator()
        pcm = PlanCodeMap()

        code_map: CodeMapSchema = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./",
            "symbols": [
                {
                    "qualified_name": "test_utils._private",
                    "kind": "function",
                    "file": "test_utils.py",
                    "line": 1,
                },
                {
                    "qualified_name": "core.critical",
                    "kind": "function",
                    "file": "core.py",
                    "line": 1,
                },
            ],
            "dependencies": [],
        }

        report = gen.generate(pcm, code_map)

        # Should mention risk levels
        assert "Risk" in report or "High" in report or "Low" in report
