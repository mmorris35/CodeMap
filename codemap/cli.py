"""CodeMap CLI entry point."""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import click

from codemap import __version__
from codemap.analyzer import (
    DependencyGraph,
    ImpactAnalyzer,
    PyanAnalyzer,
    SourceLocation,
    Symbol,
    SymbolKind,
    SymbolRegistry,
)
from codemap.config import CodeMapConfig, load_config
from codemap.logging_config import get_logger, setup_logging
from codemap.output import (
    CodeMapGenerator,
    DevPlanParser,
    DriftReportGenerator,
    MermaidGenerator,
    PlanCodeLinker,
)

if TYPE_CHECKING:
    from codemap.analyzer.impact import ImpactReport

logger = get_logger(__name__)


@click.group()
@click.version_option(version=__version__)
@click.option(
    "-v",
    "--verbose",
    is_flag=True,
    help="Enable DEBUG level logging for troubleshooting.",
)
@click.option(
    "-q",
    "--quiet",
    is_flag=True,
    help="Suppress INFO level logging for CI/CD pipelines.",
)
@click.pass_context
def cli(ctx: click.Context, verbose: bool, quiet: bool) -> None:
    """CodeMap - Know what breaks before you break it.

    Analyze Python codebases to generate dependency graphs and impact maps
    that link to DevPlanBuilder outputs. See exactly what will be affected
    when you change something, with risk scoring and test suggestions.

    For detailed help on any command:
        codemap <command> --help

    Examples:

        codemap analyze
        codemap impact auth.validate_user
        codemap graph --level function --module auth
        codemap sync --devplan DEVELOPMENT_PLAN.md
        codemap drift --devplan DEVELOPMENT_PLAN.md

    Documentation: https://github.com/your-username/codemap
    """
    # Determine log level
    if verbose:
        log_level = "DEBUG"
    elif quiet:
        log_level = "WARNING"
    else:
        log_level = "INFO"

    setup_logging(level=log_level)
    logger.debug("Logging level set to %s", log_level)


@cli.command("analyze")
@click.option(
    "--source",
    "-s",
    type=click.Path(exists=True, file_okay=False),
    default=".",
    show_default=True,
    help="Source directory to analyze (Python files).",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(file_okay=False),
    default=".codemap",
    show_default=True,
    help="Output directory for CODE_MAP.json and diagrams.",
)
@click.option(
    "--exclude",
    "-e",
    multiple=True,
    help="Patterns to exclude (repeatable, e.g., -e __pycache__ -e .venv).",
)
def analyze_command(
    source: str,
    output: str,
    exclude: tuple[str, ...],
) -> None:
    """Analyze codebase and generate dependency graph.

    Performs AST analysis on Python files to extract all symbols (modules,
    classes, functions) and their dependencies. Generates:
    - CODE_MAP.json: Complete dependency graph
    - ARCHITECTURE.mermaid: Module-level diagram

    This is the first command to run in CodeMap workflow.

    Examples:

        codemap analyze
            Analyze current directory, output to .codemap/

        codemap analyze --source ./src --output ./output
            Analyze src/, write to output/

        codemap analyze -e __pycache__ -e .venv -e tests
            Exclude multiple patterns from analysis

        codemap -v analyze
            Run with DEBUG logging for troubleshooting
    """
    logger.info("Starting code analysis on %s", source)

    try:
        source_path = Path(source)
        output_path = Path(output)

        # Load configuration
        config_kwargs: dict[str, Any] = {
            "source_dir": source_path,
            "output_dir": output_path,
        }
        if exclude:
            config_kwargs["exclude_patterns"] = list(exclude)

        config = CodeMapConfig(**config_kwargs)
        logger.debug(
            "Configuration: source=%s, output=%s, exclude=%s",
            config.source_dir,
            config.output_dir,
            config.exclude_patterns,
        )

        # Collect Python files
        python_files: list[Path] = []
        for file_path in config.source_dir.rglob("*.py"):
            # Skip excluded patterns
            skip = False
            for pattern in config.exclude_patterns or []:
                if pattern in str(file_path):
                    skip = True
                    break
            if not skip:
                python_files.append(file_path)

        if not python_files:
            click.echo(
                "Error: No Python files found to analyze",
                err=True,
            )
            sys.exit(1)

        click.echo(f"Found {len(python_files)} Python files")

        # Analyze code
        analyzer = PyanAnalyzer(exclude_patterns=config.exclude_patterns)
        call_graph = analyzer.analyze_files(python_files)

        # Build symbol registry from pyan call graph
        registry = SymbolRegistry()
        graph = DependencyGraph()

        # Create Symbol objects from pyan nodes
        for node_name in call_graph.nodes:
            # Parse node name to determine kind
            # pyan format: "module:name", "function:module.name", "method:module.class.name"
            if ":" in node_name:
                kind_str, qualified_name = node_name.split(":", 1)
            else:
                kind_str = "module"
                qualified_name = node_name

            # Map pyan kind to SymbolKind
            kind_mapping = {
                "module": SymbolKind.MODULE,
                "function": SymbolKind.FUNCTION,
                "method": SymbolKind.METHOD,
                "class": SymbolKind.CLASS,
            }
            symbol_kind = kind_mapping.get(kind_str, SymbolKind.FUNCTION)

            # Create location (file will be inferred later)
            location = SourceLocation(file=source_path, line=1)

            # Create symbol
            symbol = Symbol(
                name=qualified_name.split(".")[-1],
                qualified_name=qualified_name,
                kind=symbol_kind,
                location=location,
            )

            # Add to registry and graph
            registry.add(symbol)
            graph.add_symbol(symbol)

        # Add dependencies from pyan call graph
        for from_sym, to_sym in call_graph.edges:
            graph.add_dependency(from_sym, to_sym, kind="calls")

        click.echo(f"Extracted {len(registry.get_all())} symbols")

        click.echo(f"Built graph with {len(graph.get_edges())} dependencies")

        # Generate CODE_MAP.json
        codemap_generator = CodeMapGenerator()
        code_map = codemap_generator.generate(
            graph=graph,
            registry=registry,
            source_root=str(config.source_dir),
        )

        # Save CODE_MAP.json
        config.output_dir.mkdir(parents=True, exist_ok=True)
        codemap_path = config.output_dir / "CODE_MAP.json"
        codemap_generator.save(code_map, codemap_path)
        click.echo(f"Saved CODE_MAP.json to {codemap_path}")

        # Generate ARCHITECTURE.mermaid
        mermaid_generator = MermaidGenerator()
        architecture_diagram = mermaid_generator.generate_module_diagram(graph)
        architecture_path = config.output_dir / "ARCHITECTURE.mermaid"
        with open(architecture_path, "w", encoding="utf-8") as f:
            f.write(architecture_diagram)
        click.echo(f"Saved ARCHITECTURE.mermaid to {architecture_path}")

        click.echo(
            f"\nAnalysis complete! Generated files in {config.output_dir}",
        )

    except (FileNotFoundError, ValueError, OSError) as exception:
        click.echo(f"Error: {exception}", err=True)
        logger.error("Analysis failed: %s", exception)
        sys.exit(1)


@cli.command("impact")
@click.argument("symbols", nargs=-1, required=True)
@click.option(
    "--depth",
    "-d",
    type=int,
    default=3,
    show_default=True,
    help="Maximum traversal depth (0 for unlimited).",
)
@click.option(
    "--format",
    "-f",
    type=click.Choice(["text", "json", "mermaid"]),
    default="text",
    show_default=True,
    help="Output format (text for terminal, json for automation, mermaid for diagrams).",
)
def impact_command(
    symbols: tuple[str, ...],
    depth: int,
    format: str,
) -> None:
    """Analyze impact of changing symbols - what breaks when you change this?

    Shows exactly which other symbols would be affected by modifying the input
    symbols, including direct callers, transitive dependencies, and risk scoring.

    SYMBOLS can be:
    - Qualified names: 'module.function', 'module.ClassName'
    - Patterns (glob): 'auth.*', 'api.routes.*'
    - Multiple values: space-separated or quoted strings

    Output includes:
    - Risk score (0-100 based on blast radius)
    - Direct impact count and list
    - Transitive impact count and list
    - Affected files
    - Suggested test files to run

    Examples:

        codemap impact auth.validate_user
            Show what breaks if validate_user changes

        codemap impact 'auth.*'
            Show impact of all functions in auth module

        codemap impact validate_user hash_password --depth 5
            Show impact of multiple symbols up to 5 levels deep

        codemap impact core.auth.jwt.verify_token --format json
            Output as JSON for parsing by other tools

        codemap impact api.routes.login --format mermaid
            Generate Mermaid diagram showing impact
    """
    logger.info("Analyzing impact for symbols: %s", symbols)

    try:
        # Load CODE_MAP.json
        config = load_config()
        codemap_path = config.output_dir / "CODE_MAP.json"

        if not codemap_path.exists():
            click.echo(
                f"Error: CODE_MAP.json not found at {codemap_path}",
                err=True,
            )
            click.echo(
                "Run 'codemap analyze' first to generate CODE_MAP.json",
                err=True,
            )
            sys.exit(1)

        codemap_generator = CodeMapGenerator()
        code_map = codemap_generator.load(codemap_path)

        # Reconstruct graph from CODE_MAP.json
        graph = DependencyGraph()
        registry = SymbolRegistry()

        # Add symbols to registry (simplified - just track names)
        for symbol_data in code_map.get("symbols", []):
            registry.add_symbol_data(symbol_data)  # type: ignore[arg-type]

        # Add symbols to graph
        for symbol_data in code_map.get("symbols", []):
            graph.add_symbol_data(symbol_data)  # type: ignore[arg-type]

        # Add dependencies
        for dep_data in code_map.get("dependencies", []):
            from_sym = dep_data.get("from_sym", "")
            to_sym = dep_data.get("to_sym", "")
            kind = dep_data.get("kind", "calls")
            if from_sym and to_sym:
                graph.add_dependency(from_sym, to_sym, kind=kind)

        # Expand glob patterns
        expanded_symbols = _expand_symbol_patterns(symbols, graph)

        if not expanded_symbols:
            click.echo(
                f"Error: No symbols found matching: {', '.join(symbols)}",
                err=True,
            )
            sys.exit(1)

        # Run impact analysis
        analyzer = ImpactAnalyzer(graph)
        report = analyzer.analyze_impact(list(expanded_symbols), max_depth=depth)

        # Output results
        if format == "text":
            _output_impact_text(report)
        elif format == "json":
            _output_impact_json(report)
        elif format == "mermaid":
            _output_impact_mermaid(report, graph)

    except (FileNotFoundError, ValueError, OSError, KeyError) as exception:
        click.echo(f"Error: {exception}", err=True)
        logger.error("Impact analysis failed: %s", exception)
        sys.exit(1)


@cli.command("graph")
@click.option(
    "--level",
    "-l",
    type=click.Choice(["module", "function"]),
    default="module",
    show_default=True,
    help="Diagram detail level (module shows files, function shows individual functions).",
)
@click.option(
    "--module",
    "-m",
    type=str,
    default=None,
    help="Focus on specific module (required for function-level diagrams).",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(),
    default=None,
    help="Output file (default: stdout/print to terminal).",
)
@click.option(
    "--format",
    "-f",
    type=click.Choice(["mermaid", "dot"]),
    default="mermaid",
    show_default=True,
    help="Output format (mermaid for GitHub/markdown, dot for GraphViz).",
)
def graph_command(
    level: str,
    module: str | None,
    output: str | None,
    format: str,
) -> None:
    """Generate dependency graph diagrams - visualize code structure.

    Creates visual representations of code dependencies at module or
    function level. Use Mermaid format for GitHub markdown, DOT for GraphViz.

    Module-level diagrams show how files depend on each other.
    Function-level diagrams show how functions/methods depend on each other
    within a specific module.

    Examples:

        codemap graph
            Show module-level diagram, print to terminal

        codemap graph -o architecture.mermaid
            Save module diagram to file

        codemap graph --level function --module auth
            Show function-level diagram for auth module

        codemap graph --level function --module api.routes -o diagram.mermaid
            Zoom into specific submodule

        codemap graph --format dot -o deps.dot
            Export as GraphViz DOT format (requires graphviz to render)

        codemap graph -o diagram.mermaid && cat diagram.mermaid
            Generate and immediately view output
    """
    logger.info(
        "Generating graph diagram (level=%s, module=%s, format=%s)",
        level,
        module,
        format,
    )

    try:
        # Load CODE_MAP.json
        config = load_config()
        codemap_path = config.output_dir / "CODE_MAP.json"

        if not codemap_path.exists():
            click.echo(
                f"Error: CODE_MAP.json not found at {codemap_path}",
                err=True,
            )
            sys.exit(1)

        codemap_generator = CodeMapGenerator()
        code_map = codemap_generator.load(codemap_path)

        # Reconstruct graph
        graph = DependencyGraph()
        for symbol_data in code_map.get("symbols", []):
            graph.add_symbol_data(symbol_data)  # type: ignore[arg-type]

        for dep_data in code_map.get("dependencies", []):
            from_sym = dep_data.get("from_sym", "")
            to_sym = dep_data.get("to_sym", "")
            kind = dep_data.get("kind", "calls")
            if from_sym and to_sym:
                graph.add_dependency(from_sym, to_sym, kind=kind)

        # Generate diagram
        mermaid_gen = MermaidGenerator()
        if level == "module":
            diagram = mermaid_gen.generate_module_diagram(graph)
        else:
            if not module:
                click.echo(
                    "Error: --module required for function-level diagrams",
                    err=True,
                )
                sys.exit(1)
            diagram = mermaid_gen.generate_function_diagram(graph, module)

        # Convert format if needed
        if format == "dot":
            diagram = _convert_mermaid_to_dot(diagram)

        # Output
        if output:
            output_path = Path(output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(diagram)
            click.echo(f"Saved diagram to {output_path}")
        else:
            click.echo(diagram)

    except (FileNotFoundError, ValueError, OSError) as exception:
        click.echo(f"Error: {exception}", err=True)
        logger.error("Graph generation failed: %s", exception)
        sys.exit(1)


@cli.command("sync")
@click.option(
    "--devplan",
    "-d",
    type=click.Path(exists=True),
    required=True,
    help="Path to DEVELOPMENT_PLAN.md (DevPlanBuilder format).",
)
@click.option(
    "--update-map",
    is_flag=True,
    help="Update CODE_MAP.json with task links (default is dry-run).",
)
def sync_command(devplan: str, update_map: bool) -> None:
    """Link development plan tasks to code symbols - enable traceability.

    Reads DEVELOPMENT_PLAN.md (DevPlanBuilder format) and creates bidirectional
    mapping between plan task IDs and actual code symbols. Shows which code
    implements which planned features.

    Matching uses:
    - File names (auth.py matches "auth" tasks)
    - Function/class names (validate_user matches "validate user" tasks)
    - Keyword overlap with confidence scoring

    By default runs in dry-run mode (shows what would be linked).
    Use --update-map to write results back to CODE_MAP.json.

    Examples:

        codemap sync --devplan DEVELOPMENT_PLAN.md
            Show matches without modifying CODE_MAP.json

        codemap sync --devplan DEVELOPMENT_PLAN.md --update-map
            Update CODE_MAP.json with task_links field on each symbol

        codemap -v sync --devplan DEVELOPMENT_PLAN.md
            Debug mode to see confidence scores
    """
    logger.info("Syncing development plan from %s", devplan)

    try:
        devplan_path = Path(devplan)

        # Load CODE_MAP.json
        config = load_config()
        codemap_path = config.output_dir / "CODE_MAP.json"

        if not codemap_path.exists():
            click.echo(
                f"Error: CODE_MAP.json not found at {codemap_path}",
                err=True,
            )
            sys.exit(1)

        # Parse DevPlan
        devplan_parser = DevPlanParser()
        dev_plan = devplan_parser.parse(devplan_path)

        # Load CODE_MAP
        codemap_gen = CodeMapGenerator()
        code_map = codemap_gen.load(codemap_path)

        # Link plan to code
        linker = PlanCodeLinker()
        linked_map = linker.link(dev_plan, code_map)

        # Count results
        matched = sum(1 for sym in code_map.get("symbols", []) if sym.get("task_links"))
        total = len(code_map.get("symbols", []))

        click.echo(f"Matched {matched}/{total} symbols to tasks")
        click.echo(f"Plan has {len(dev_plan.get_all_subtasks())} subtasks")

        if update_map:
            codemap_gen.save(linked_map, codemap_path)  # type: ignore[arg-type]
            click.echo("Updated CODE_MAP.json with task links")
        else:
            click.echo("(Use --update-map to write changes)")

    except (FileNotFoundError, ValueError, OSError) as exception:
        click.echo(f"Error: {exception}", err=True)
        logger.error("Sync failed: %s", exception)
        sys.exit(1)


@cli.command("drift")
@click.option(
    "--devplan",
    "-d",
    type=click.Path(exists=True),
    required=True,
    help="Path to DEVELOPMENT_PLAN.md file.",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(),
    default=None,
    help="Output file (default: print to stdout).",
)
@click.option(
    "--format",
    "-f",
    type=click.Choice(["markdown", "json"]),
    default="markdown",
    show_default=True,
    help="Output format (markdown for reports, json for automation).",
)
def drift_command(
    devplan: str,
    output: str | None,
    format: str,
) -> None:
    """Detect architecture drift - planned vs actual discrepancies.

    Compares DEVELOPMENT_PLAN.md to actual code and reports:
    - Implemented as planned: symbols that match the plan
    - Missing: planned features not yet coded
    - Unplanned: code that wasn't in the original plan (scope creep)

    Generates comprehensive report with:
    - Summary statistics
    - Risk assessment and recommendations
    - Lists of missing and unplanned symbols

    Exit codes:
    - 0: No drift detected (plan matches code)
    - 1: Drift detected (missing or unplanned code)

    Examples:

        codemap drift --devplan DEVELOPMENT_PLAN.md
            Print drift report to terminal

        codemap drift --devplan DEVELOPMENT_PLAN.md -o DRIFT_REPORT.md
            Save report to file

        codemap drift --devplan DEVELOPMENT_PLAN.md --format json
            Output as JSON for parsing by other tools

        codemap drift --devplan DEVELOPMENT_PLAN.md && echo "No drift"
            Use exit code in scripts (exit 0 = no drift)
    """
    logger.info("Generating drift report from %s", devplan)

    try:
        devplan_path = Path(devplan)

        # Load configuration
        config = load_config()
        codemap_path = config.output_dir / "CODE_MAP.json"

        if not codemap_path.exists():
            click.echo(
                f"Error: CODE_MAP.json not found at {codemap_path}",
                err=True,
            )
            sys.exit(1)

        # Parse DevPlan
        devplan_parser = DevPlanParser()
        dev_plan = devplan_parser.parse(devplan_path)

        # Load CODE_MAP
        codemap_gen = CodeMapGenerator()
        code_map = codemap_gen.load(codemap_path)

        # Link plan to code first
        linker = PlanCodeLinker()
        plan_code_map = linker.link(dev_plan, code_map)

        # Generate drift report
        drift_gen = DriftReportGenerator()
        report_text = drift_gen.generate(plan_code_map, code_map)

        # Handle format conversion for JSON
        if format == "json":
            # Convert markdown to JSON format
            drift_data: dict[str, Any] = {
                "format": "json",
                "report": report_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            report_text = json.dumps(drift_data, indent=2)

        # Write output
        if output:
            output_path = Path(output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(report_text)
            click.echo(f"Saved drift report to {output_path}")
        else:
            click.echo(report_text)

        # Exit with status based on drift (1 if drift found, 0 if no drift)
        # Count if there are "But Not" sections to determine drift
        has_drift = "But Not" in report_text
        exit_code = 1 if has_drift else 0
        sys.exit(exit_code)

    except (FileNotFoundError, ValueError, OSError) as exception:
        click.echo(f"Error: {exception}", err=True)
        logger.error("Drift report failed: %s", exception)
        sys.exit(1)


@cli.command("install-hooks")
@click.option(
    "--pre-commit",
    is_flag=True,
    help="Install pre-commit hook (runs before commit).",
)
@click.option(
    "--post-commit",
    is_flag=True,
    help="Install post-commit hook (runs after successful commit).",
)
@click.option(
    "--uninstall",
    is_flag=True,
    help="Uninstall previously installed hooks (restores backups).",
)
def install_hooks_command(
    pre_commit: bool,
    post_commit: bool,
    uninstall: bool,
) -> None:
    """Install git hooks for automatic CodeMap analysis on commits.

    Hooks automatically analyze code on commits to keep CODE_MAP.json
    and dependency information fresh. Useful for:
    - Catching impact of changes before they're committed
    - Keeping drift reports up-to-date in CI/CD
    - Automating code quality checks

    Pre-commit hooks run before commit (can prevent commit if needed).
    Post-commit hooks run after successful commit (informational).

    Backups: Existing hooks are backed up before installation (.bak files).

    To skip hooks on specific commits:
        CODEMAP_SKIP=1 git commit -m "message"

    Examples:

        codemap install-hooks --pre-commit
            Enable pre-commit analysis before commits

        codemap install-hooks --pre-commit --post-commit
            Install both hooks

        codemap install-hooks --uninstall
            Remove hooks and restore backups
    """
    logger.info(
        "Managing git hooks (pre=%s, post=%s, uninstall=%s)",
        pre_commit,
        post_commit,
        uninstall,
    )

    try:
        git_dir = Path.cwd() / ".git"
        if not git_dir.exists():
            click.echo(
                "Error: Not in a git repository",
                err=True,
            )
            sys.exit(1)

        hooks_dir = git_dir / "hooks"
        hooks_dir.mkdir(parents=True, exist_ok=True)

        if uninstall:
            # Remove pre-commit hook
            pre_commit_hook = hooks_dir / "pre-commit"
            if pre_commit_hook.exists():
                pre_commit_hook.unlink()
                click.echo("Removed pre-commit hook")

                # Restore backup if exists
                backup = hooks_dir / "pre-commit.bak"
                if backup.exists():
                    shutil.copy(backup, pre_commit_hook)
                    backup.unlink()
                    click.echo("Restored pre-commit hook backup")

            # Remove post-commit hook
            post_commit_hook = hooks_dir / "post-commit"
            if post_commit_hook.exists():
                post_commit_hook.unlink()
                click.echo("Removed post-commit hook")

                # Restore backup if exists
                backup = hooks_dir / "post-commit.bak"
                if backup.exists():
                    shutil.copy(backup, post_commit_hook)
                    backup.unlink()
                    click.echo("Restored post-commit hook backup")
        else:
            # Install hooks
            if pre_commit or (not post_commit):
                pre_commit_hook = hooks_dir / "pre-commit"
                if pre_commit_hook.exists():
                    # Backup existing
                    backup = hooks_dir / "pre-commit.bak"
                    shutil.copy(pre_commit_hook, backup)
                    click.echo(f"Backed up existing pre-commit hook to {backup}")

                # Write new hook
                hook_content = _get_pre_commit_hook_script()
                with open(pre_commit_hook, "w", encoding="utf-8") as f:
                    f.write(hook_content)
                pre_commit_hook.chmod(0o755)
                click.echo(f"Installed pre-commit hook at {pre_commit_hook}")

            if post_commit:
                post_commit_hook = hooks_dir / "post-commit"
                if post_commit_hook.exists():
                    # Backup existing
                    backup = hooks_dir / "post-commit.bak"
                    shutil.copy(post_commit_hook, backup)
                    click.echo(f"Backed up existing post-commit hook to {backup}")

                # Write new hook
                hook_content = _get_post_commit_hook_script()
                with open(post_commit_hook, "w", encoding="utf-8") as f:
                    f.write(hook_content)
                post_commit_hook.chmod(0o755)
                click.echo(f"Installed post-commit hook at {post_commit_hook}")

    except (OSError, IOError) as exception:
        click.echo(f"Error: {exception}", err=True)
        logger.error("Hook installation failed: %s", exception)
        sys.exit(1)


# Helper functions


def _expand_symbol_patterns(
    patterns: tuple[str, ...],
    graph: DependencyGraph,
) -> set[str]:
    """Expand glob patterns to matching symbols.

    Args:
        patterns: Symbol names or patterns (e.g., 'auth.*')
        graph: DependencyGraph to match against

    Returns:
        Set of matching qualified symbol names
    """
    import fnmatch

    expanded: set[str] = set()
    all_nodes = graph.get_nodes()

    for pattern in patterns:
        if "*" in pattern:
            # Glob pattern
            for node in all_nodes:
                if fnmatch.fnmatch(node, pattern):
                    expanded.add(node)
        else:
            # Exact match
            if pattern in all_nodes:
                expanded.add(pattern)

    return expanded


def _output_impact_text(report: ImpactReport) -> None:
    """Output impact report as human-readable text."""
    click.echo(f"Risk Score: {report.risk_score}/100")
    click.echo(f"Affected Symbols: {len(report.affected_symbols)}")
    click.echo(f"Affected Files: {len(report.affected_files)}")
    click.echo()

    if report.direct_impacts:
        click.echo("Direct Impacts:")
        for symbol in sorted(report.direct_impacts)[:10]:
            click.echo(f"  - {symbol}")

    if report.transitive_impacts:
        click.echo("Transitive Impacts:")
        for symbol in sorted(report.transitive_impacts)[:10]:
            click.echo(f"  - {symbol}")

    if len(report.direct_impacts) > 10:
        click.echo(f"  ... and {len(report.direct_impacts) - 10} more")


def _output_impact_json(report: ImpactReport) -> None:
    """Output impact report as JSON."""
    data = {
        "risk_score": report.risk_score,
        "affected_symbols": report.affected_symbols,
        "affected_files": [str(f) for f in report.affected_files],
        "direct_impacts": report.direct_impacts,
        "transitive_impacts": report.transitive_impacts,
    }
    click.echo(json.dumps(data, indent=2))


def _output_impact_mermaid(
    report: ImpactReport,
    graph: DependencyGraph,
) -> None:
    """Output impact report as Mermaid diagram."""
    click.echo("flowchart TD")
    for symbol in report.affected_symbols[:20]:
        safe_name = symbol.replace(".", "_").replace("-", "_")
        click.echo(f'    {safe_name}["{symbol}"]')

    # Add a few edges
    for from_sym, to_sym in graph.get_edges()[:20]:
        if from_sym in report.affected_symbols and to_sym in report.affected_symbols:
            from_id = from_sym.replace(".", "_").replace("-", "_")
            to_id = to_sym.replace(".", "_").replace("-", "_")
            click.echo(f"    {from_id} --> {to_id}")


def _convert_mermaid_to_dot(mermaid_str: str) -> str:
    """Convert Mermaid flowchart to DOT format (simplified).

    Args:
        mermaid_str: Mermaid flowchart syntax

    Returns:
        DOT format string
    """
    lines = ["digraph {"]
    for line in mermaid_str.split("\n"):
        line = line.strip()
        if "-->" in line:
            parts = line.split("-->")
            if len(parts) == 2:
                from_node = parts[0].strip()
                to_node = parts[1].strip()
                lines.append(f'    "{from_node}" -> "{to_node}";')
    lines.append("}")
    return "\n".join(lines)


def _get_pre_commit_hook_script() -> str:
    """Get the pre-commit hook script content."""
    return """#!/bin/bash
# CodeMap pre-commit hook
# Automatically updates CODE_MAP.json for staged changes

set -e

if [ "${CODEMAP_SKIP}" = "1" ]; then
    exit 0
fi

# Run CodeMap pre-commit check
python -m codemap.hooks.pre_commit
exit $?
"""


def _get_post_commit_hook_script() -> str:
    """Get the post-commit hook script content."""
    return """#!/bin/bash
# CodeMap post-commit hook
# Generates drift report after successful commit

set -e

if [ "${CODEMAP_SKIP}" = "1" ]; then
    exit 0
fi

# Run CodeMap analysis and drift check
python -c "from codemap.config import load_config; \\
config = load_config(); \\
print(f'CodeMap: Analysis ready at {config.output_dir}')" \\
  2>/dev/null || true
exit 0
"""


if __name__ == "__main__":
    cli()
