# CLAUDE.md - Project Rules for CodeMap

> This document defines HOW Claude Code should work on CodeMap.
> Read at the start of every session to maintain consistency.

## Core Operating Principles

### 1. Single Session Execution
- Complete the ENTIRE subtask in this session
- End every session with a git commit
- If blocked, document why and mark as BLOCKED
- Never leave work partially complete without documentation

### 2. Read Before Acting
**Every session must begin with:**
1. Read DEVELOPMENT_PLAN.md completely
2. Locate the specific subtask ID from the prompt
3. Verify prerequisites are marked `[x]` complete
4. Read completion notes from prerequisites for context
5. Understand the technology decisions and rationale

### 3. File Management

**Project Structure:**
```
codemap/
├── codemap/                    # Main package
│   ├── __init__.py             # Package init with __version__
│   ├── cli.py                  # Click CLI entry point
│   ├── config.py               # Configuration management
│   ├── logging_config.py       # Centralized logging
│   ├── analyzer/               # AST and graph analysis
│   │   ├── __init__.py
│   │   ├── pyan_wrapper.py     # pyan3 integration
│   │   ├── ast_visitor.py      # Custom AST analysis
│   │   ├── symbols.py          # Symbol registry
│   │   ├── graph.py            # NetworkX graph operations
│   │   └── impact.py           # Impact analysis
│   ├── output/                 # Output generators
│   │   ├── __init__.py
│   │   ├── mermaid.py          # Mermaid diagram generation
│   │   ├── code_map.py         # CODE_MAP.json generator
│   │   ├── schemas.py          # JSON schemas
│   │   ├── devplan_parser.py   # DEVELOPMENT_PLAN.md parser
│   │   ├── linker.py           # Plan-to-code linking
│   │   └── drift_report.py     # Drift report generation
│   └── hooks/                  # Git hook scripts
│       ├── __init__.py
│       └── pre_commit.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Shared fixtures
│   ├── test_cli.py
│   ├── test_config.py
│   ├── test_logging.py
│   ├── analyzer/               # Analyzer tests
│   │   ├── __init__.py
│   │   └── test_*.py
│   ├── output/                 # Output tests
│   │   ├── __init__.py
│   │   └── test_*.py
│   ├── hooks/                  # Hook tests
│   │   ├── __init__.py
│   │   └── test_*.py
│   ├── integration/            # E2E tests
│   │   ├── __init__.py
│   │   └── test_*.py
│   ├── benchmarks/             # Performance tests
│   │   ├── __init__.py
│   │   └── test_*.py
│   └── fixtures/               # Test data
│       ├── sample_module.py
│       ├── sample_caller.py
│       ├── sample_devplan.md
│       └── sample_project/
├── schemas/                    # JSON schemas
│   └── code_map.schema.json
├── examples/                   # Example outputs
│   ├── README.md
│   ├── demo_project/
│   ├── module_diagram.mermaid
│   ├── function_diagram.mermaid
│   ├── impact_diagram.mermaid
│   └── DRIFT_REPORT.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── .pre-commit-config.yaml
├── pyproject.toml
├── README.md
├── LICENSE
├── CLAUDE.md                   # This file
├── PROJECT_BRIEF.md            # Requirements
└── DEVELOPMENT_PLAN.md         # Development roadmap
```

**Creating Files:**
- Use exact paths specified in subtask
- Add proper module docstrings with description
- Include type hints on ALL functions and methods
- Never use single-letter variable names

**Modifying Files:**
- Only modify files listed in subtask "Files to Modify"
- Preserve ALL existing functionality (no "simplifying for now")
- Update related tests when modifying implementation
- Run tests after each modification

### 4. Testing Requirements

**Unit Tests:**
- Write tests for EVERY new function/class
- Place in `tests/` mirroring source structure
- Use `test_` prefix for test files and functions
- Minimum coverage: 80% overall
- Test success, failure, and edge cases

**Integration Tests:**
- Prioritize integration testing over heavily mocked unit tests
- Test real interactions between components
- Only mock external dependencies (filesystem, network)
- Test the actual integration points where bugs occur

**Running Tests:**
```bash
# All tests with coverage
pytest tests/ -v --cov=codemap --cov-report=term-missing

# Specific test file
pytest tests/analyzer/test_pyan_wrapper.py -v

# With HTML coverage report
pytest --cov=codemap --cov-report=html

# Skip benchmarks (slow)
pytest tests/ -v --ignore=tests/benchmarks/

# Run specific test
pytest tests/test_cli.py::test_version -v
```

**Before Every Commit:**
```bash
# Run all checks
ruff check codemap tests
ruff format --check codemap tests
mypy codemap
pytest tests/ -v --cov=codemap --cov-fail-under=80
```

### 5. Completion Protocol

**When a subtask is complete:**

1. **Verify all deliverables** - every checkbox item must be done

2. **Run full test suite:**
```bash
ruff check codemap tests && \
ruff format --check codemap tests && \
mypy codemap && \
pytest tests/ -v --cov=codemap
```

3. **Update DEVELOPMENT_PLAN.md** with completion notes:
```markdown
**Completion Notes:**
- **Implementation**: Brief description of what was built
- **Files Created**:
  - `codemap/analyzer/pyan_wrapper.py` - 145 lines
  - `tests/analyzer/test_pyan_wrapper.py` - 98 lines
- **Files Modified**:
  - `codemap/analyzer/__init__.py` - added exports
- **Tests**: 8 tests, 87% coverage
- **Build**: ruff: pass, mypy: pass
- **Branch**: feature/1.2-ast-analysis
- **Notes**: Used pyan3 CallGraphVisitor, wrapped exceptions
```

4. **Check all checkboxes** in the subtask (change `[ ]` to `[x]`)

5. **Git commit** with semantic message:
```bash
git add .
git commit -m "feat(analyzer): implement pyan3 wrapper for AST analysis

- Wrap pyan3 CallGraphVisitor for dependency extraction
- Handle parse errors gracefully with logging
- Support exclude patterns from config
- 8 tests, 87% coverage"
```

6. **Report completion** with summary to user

### 6. Technology Stack

**Runtime:**
- **Language**: Python 3.11+
- **CLI Framework**: Click 8.1+
- **AST Analysis**: pyan3
- **Graph Operations**: NetworkX 3.0+
- **Diagram Generation**: python-mermaid

**Development:**
- **Testing**: pytest 7.4+, pytest-cov
- **Linting**: ruff 0.1+
- **Type Checking**: mypy 1.7+
- **Pre-commit**: pre-commit 3.0+

**Installing Dependencies:**
```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Unix
# or: .venv\Scripts\activate  # Windows

# Install with dev dependencies
pip install -e ".[dev]"

# Install pre-commit hooks
pre-commit install
```

### 7. Error Handling

**If you encounter an error:**
1. Attempt to fix using project patterns
2. Check if it's a known issue in dependencies
3. If blocked, update DEVELOPMENT_PLAN.md:
   ```markdown
   **Completion Notes:**
   - **Status**: BLOCKED
   - **Error**: [Detailed error message]
   - **Attempted**: [What was tried]
   - **Root Cause**: [Analysis]
   - **Suggested Fix**: [What should be done]
   ```
4. Do NOT mark subtask complete if blocked
5. Do NOT commit broken code
6. Report immediately to user

**Error Handling in Code:**
- Use specific exception types, never bare `except:`
- Log errors with context using module logger
- Provide helpful error messages for CLI users
- Return appropriate exit codes (0=success, 1=error)

### 8. Code Quality Standards

**Python Style:**
- Follow PEP 8 (enforced by ruff)
- Type hints on ALL functions: `def func(arg: int) -> str:`
- Docstrings: Google style for all public functions/classes
- Max line length: 100 characters
- Use descriptive variable names (no single letters)

**Example Function:**
```python
def analyze_impact(
    graph: DependencyGraph,
    symbols: list[str],
    max_depth: int = 3,
) -> ImpactReport:
    """Analyze the impact of changes to specified symbols.

    Traverses the dependency graph to find all symbols that would be
    affected by changes to the input symbols, up to max_depth levels.

    Args:
        graph: The dependency graph to analyze.
        symbols: List of qualified symbol names to check impact for.
        max_depth: Maximum traversal depth. Use 0 for unlimited.

    Returns:
        ImpactReport containing affected symbols, files, and risk score.

    Raises:
        ValueError: If any symbol is not found in the graph.
        GraphError: If the graph is malformed or disconnected.

    Example:
        >>> report = analyze_impact(graph, ["auth.validate_user"])
        >>> print(f"Risk score: {report.risk_score}")
        Risk score: 45
    """
    logger = get_logger(__name__)
    logger.debug("Analyzing impact for %d symbols", len(symbols))

    # Validate all symbols exist
    missing = [sym for sym in symbols if sym not in graph]
    if missing:
        raise ValueError(f"Symbols not found in graph: {missing}")

    # Implementation continues...
```

**Imports (in order):**
1. Standard library (alphabetical)
2. Third-party packages (alphabetical)
3. Local imports (alphabetical)

```python
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import click
import networkx as nx
from pyan import CallGraphVisitor

from codemap.analyzer.symbols import Symbol, SymbolRegistry
from codemap.logging_config import get_logger

if TYPE_CHECKING:
    from codemap.config import CodeMapConfig
```

**Prohibited:**
- `print()` for output - use `click.echo()` or logging
- `exit()` or `sys.exit()` in library code - raise exceptions
- Bare `except:` - catch specific exceptions
- Global mutable state - use classes or pass parameters
- Single-letter variable names - be descriptive
- Commented-out code - delete it, use git for history

### 9. CLI Design Standards

**Command Structure:**
```bash
codemap <command> [options] [arguments]
```

**All commands must:**
- Have comprehensive `--help` text with examples
- Use Click's option/argument validation
- Provide clear, actionable error messages
- Support `--verbose/-v` for debug output
- Support `--quiet/-q` for minimal output
- Return proper exit codes (0=success, 1=error, 2=usage error)

**Example Command:**
```python
@cli.command("impact")
@click.argument("symbols", nargs=-1, required=True)
@click.option(
    "--depth",
    "-d",
    type=int,
    default=3,
    show_default=True,
    help="Maximum traversal depth for impact analysis.",
)
@click.option(
    "--format",
    "-f",
    type=click.Choice(["text", "json", "mermaid"]),
    default="text",
    show_default=True,
    help="Output format.",
)
@click.pass_context
def impact_command(
    ctx: click.Context,
    symbols: tuple[str, ...],
    depth: int,
    format: str,
) -> None:
    """Analyze the impact of changes to specified symbols.

    SYMBOLS are qualified names like 'module.function' or patterns
    like 'auth.*'. Multiple symbols can be specified.

    Examples:

        codemap impact auth.validate_user

        codemap impact 'auth.*' 'db.*' --depth 5

        codemap impact main.run --format json
    """
    logger = get_logger(__name__)
    logger.info("Analyzing impact for symbols: %s", symbols)

    # Implementation...
```

### 10. Logging Standards

**Use centralized logging from `codemap/logging_config.py`:**

```python
from codemap.logging_config import get_logger

logger = get_logger(__name__)

def some_function():
    logger.debug("Starting operation with param=%s", param)
    logger.info("Processing %d items", count)
    logger.warning("Config file not found, using defaults")
    logger.error("Failed to parse file: %s", error)
```

**Log Levels:**
- `DEBUG`: Detailed diagnostic information
- `INFO`: General operational information
- `WARNING`: Something unexpected but recoverable
- `ERROR`: Operation failed but application continues

**Never use:**
- `print()` statements for logging
- f-strings in log messages (use % formatting for lazy evaluation)

### 11. Git Conventions

**Branch Naming:**
```
feature/{phase}.{task}-{short-description}
```

Examples:
- `feature/0.1-repository-setup`
- `feature/1.2-ast-analysis`
- `feature/2.1-mermaid-diagrams`

**Commit Messages:**
```
type(scope): short description

- Detailed point 1
- Detailed point 2
- Tests and coverage info
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `docs`: Documentation only changes
- `chore`: Build process, dependencies, etc.

**Branch Workflow:**
1. Create branch at start of TASK (not subtask)
2. Commit after each subtask completion
3. Squash merge to main when task complete
4. Delete feature branch after merge

### 12. Build Verification

**Before marking subtask complete:**

```bash
# 1. Linting (must pass)
ruff check codemap tests

# 2. Formatting (must pass)
ruff format --check codemap tests

# 3. Type checking (must pass)
mypy codemap

# 4. Tests with coverage (must be >= 80%)
pytest tests/ -v --cov=codemap --cov-report=term-missing --cov-fail-under=80

# 5. Build package (must succeed)
python -m build

# 6. Verify CLI works
pip install -e .
codemap --version
codemap --help
```

**All must pass with no errors.**

---

## Session Checklists

### Starting a New Session

- [ ] Read this CLAUDE.md completely
- [ ] Read DEVELOPMENT_PLAN.md completely
- [ ] Locate subtask ID from prompt (e.g., "1.2.3")
- [ ] Verify ALL prerequisites are marked `[x]` complete
- [ ] Read completion notes from prerequisites
- [ ] Understand technology decisions for this subtask
- [ ] Note the "Files to Create" and "Files to Modify" lists
- [ ] Understand success criteria
- [ ] Activate virtual environment: `source .venv/bin/activate`
- [ ] Ready to code!

### Ending a Session

- [ ] All subtask deliverable checkboxes checked `[x]`
- [ ] All success criteria checkboxes checked `[x]`
- [ ] All new code has type hints
- [ ] All new functions have docstrings
- [ ] Linting passes: `ruff check codemap tests`
- [ ] Formatting passes: `ruff format --check codemap tests`
- [ ] Type checking passes: `mypy codemap`
- [ ] All tests pass: `pytest tests/ -v`
- [ ] Coverage >= 80%: `pytest --cov=codemap --cov-fail-under=80`
- [ ] Completion notes written in DEVELOPMENT_PLAN.md
- [ ] Git commit with semantic message
- [ ] User notified with summary

---

## Quick Reference

**Run all checks:**
```bash
ruff check codemap tests && ruff format --check codemap tests && mypy codemap && pytest tests/ -v --cov=codemap
```

**Common pytest commands:**
```bash
pytest tests/ -v                           # All tests, verbose
pytest tests/test_cli.py -v                # Single file
pytest tests/ -k "test_analyze" -v         # Tests matching pattern
pytest tests/ --cov=codemap --cov-report=html  # With HTML report
pytest tests/ -x                           # Stop on first failure
```

**Semantic commit types:**
- `feat(scope):` - New feature
- `fix(scope):` - Bug fix
- `refactor(scope):` - Code restructuring
- `test(scope):` - Test additions/changes
- `docs(scope):` - Documentation
- `chore(scope):` - Maintenance

---

**Version**: 1.0
**Last Updated**: 2024-12-16
**Project**: CodeMap

*Generated with DevPlan methodology*
