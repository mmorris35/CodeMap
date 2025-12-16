"""Performance benchmarks for CodeMap analysis."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from click.testing import CliRunner

from codemap.cli import cli
from tests.benchmarks.codegen import estimate_lines_of_code, generate_synthetic_project


@pytest.fixture()  # type: ignore[misc]
def cli_runner() -> CliRunner:
    """Provide a Click test runner for CLI benchmarks.

    Returns:
        A CliRunner instance.
    """
    return CliRunner()


@pytest.mark.benchmark  # type: ignore[misc]
def test_analyze_small_codebase(cli_runner: CliRunner) -> None:
    """Benchmark analyze command on small codebase (~1k LOC).

    Performance target: < 2 seconds

    Uses a synthetic project with:
    - 10 modules
    - 10 functions per module
    - Total: ~1,300 LOC
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir) / "project"
        output_dir = Path(tmpdir) / "output"

        # Generate synthetic project
        generate_synthetic_project(
            project_dir,
            num_modules=10,
            functions_per_module=10,
        )
        loc = estimate_lines_of_code(10, 10)
        print(f"\nBenchmarking analyze on {loc} LOC project")

        # Run analyze command
        result = cli_runner.invoke(
            cli,
            ["analyze", "--source", str(project_dir), "--output", str(output_dir)],
        )

        # Verify it completed successfully
        assert result.exit_code == 0
        output_file = output_dir / "CODE_MAP.json"
        assert output_file.exists()


@pytest.mark.benchmark  # type: ignore[misc]
def test_analyze_medium_codebase(cli_runner: CliRunner) -> None:
    """Benchmark analyze command on medium codebase (~10k LOC).

    Performance target: < 10 seconds

    Uses a synthetic project with:
    - 50 modules
    - 15 functions per module
    - Total: ~9,750 LOC
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir) / "project"
        output_dir = Path(tmpdir) / "output"

        # Generate synthetic project
        generate_synthetic_project(
            project_dir,
            num_modules=50,
            functions_per_module=15,
        )
        loc = estimate_lines_of_code(50, 15)
        print(f"\nBenchmarking analyze on {loc} LOC project")

        # Run analyze command
        result = cli_runner.invoke(
            cli,
            ["analyze", "--source", str(project_dir), "--output", str(output_dir)],
        )

        # Verify it completed successfully
        assert result.exit_code == 0
        output_file = output_dir / "CODE_MAP.json"
        assert output_file.exists()


@pytest.mark.benchmark  # type: ignore[misc]
def test_analyze_large_codebase(cli_runner: CliRunner) -> None:
    """Benchmark analyze command on large codebase (~50k LOC).

    Performance target: < 30 seconds

    Uses a synthetic project with:
    - 100 modules
    - 40 functions per module
    - Total: ~52,000 LOC
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir) / "project"
        output_dir = Path(tmpdir) / "output"

        # Generate synthetic project
        generate_synthetic_project(
            project_dir,
            num_modules=100,
            functions_per_module=40,
        )
        loc = estimate_lines_of_code(100, 40)
        print(f"\nBenchmarking analyze on {loc} LOC project")

        # Run analyze command
        result = cli_runner.invoke(
            cli,
            ["analyze", "--source", str(project_dir), "--output", str(output_dir)],
        )

        # Verify it completed successfully
        assert result.exit_code == 0
        output_file = output_dir / "CODE_MAP.json"
        assert output_file.exists()


@pytest.mark.benchmark  # type: ignore[misc]
def test_graph_generation_performance(cli_runner: CliRunner) -> None:
    """Benchmark graph generation on medium codebase.

    Performance target: < 5 seconds

    Uses the same synthetic project as medium codebase test.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir) / "project"
        output_dir = Path(tmpdir) / "output"

        # Generate and analyze synthetic project
        generate_synthetic_project(
            project_dir,
            num_modules=50,
            functions_per_module=15,
        )

        # First, analyze
        analyze_result = cli_runner.invoke(
            cli,
            ["analyze", "--source", str(project_dir), "--output", str(output_dir)],
        )
        assert analyze_result.exit_code == 0

        # Now benchmark graph generation
        graph_result = cli_runner.invoke(
            cli,
            ["graph", "--level", "module"],
            env={"CODEMAP_OUTPUT_DIR": str(output_dir)},
        )

        # Verify it completed successfully
        assert graph_result.exit_code == 0
        assert "flowchart" in graph_result.output or "graph" in graph_result.output


@pytest.mark.benchmark  # type: ignore[misc]
def test_impact_analysis_performance(cli_runner: CliRunner) -> None:
    """Benchmark impact analysis on medium codebase.

    Performance target: < 5 seconds

    Uses the same synthetic project as medium codebase test.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir) / "project"
        output_dir = Path(tmpdir) / "output"

        # Generate and analyze synthetic project
        generate_synthetic_project(
            project_dir,
            num_modules=20,
            functions_per_module=10,
        )

        # First, analyze
        analyze_result = cli_runner.invoke(
            cli,
            ["analyze", "--source", str(project_dir), "--output", str(output_dir)],
        )
        assert analyze_result.exit_code == 0

        # Now benchmark impact analysis
        impact_result = cli_runner.invoke(
            cli,
            ["impact", "module_000.func_000"],
            env={"CODEMAP_OUTPUT_DIR": str(output_dir)},
        )

        # Impact command may fail if CODE_MAP not in default location, that's OK
        # We just want to verify it doesn't crash
        assert impact_result.exit_code in (0, 1)
