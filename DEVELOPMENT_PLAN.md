# DEVELOPMENT_PLAN.md

# CodeMap - Development Plan

## 🎯 How to Use This Plan

**For Claude Code**: Read this plan, find the subtask ID from the prompt, complete ALL checkboxes, update completion notes, commit.

**For You**: Use this prompt (change only the subtask ID):
```
please re-read claude.md and DEVELOPMENT_PLAN.md (the entire documents, for context), then continue with [X.Y.Z], following all of the development plan and claude.md rules.
```

---

## Project Overview

**Project Name**: CodeMap
**Goal**: Analyze Python codebases to generate dependency graphs and impact maps that link to DevPlanBuilder outputs, enabling change impact analysis and architecture drift detection.
**Target Users**: Developers using Claude Code with DevPlanBuilder methodology, Teams maintaining legacy Python codebases, Technical leads doing code reviews and refactoring
**Timeline**: 2 weeks

**MVP Scope**:
- AST-based code analysis using pyan3 to extract function/class/module dependencies
- Mermaid diagram generation for visual dependency graphs at module and function levels
- Bidirectional linking between DEVELOPMENT_PLAN.md task IDs and code symbols
- CODE_MAP.json output tracking plan-to-code relationships
- DRIFT_REPORT.md generation showing planned vs implemented discrepancies
- CLI interface for queries like `codemap impact src/auth.py::validate_user`
- Git hook integration for automatic re-analysis on commits

---

## Technology Stack

- **Language**: Python 3.11+
- **CLI Framework**: Click
- **AST Analysis**: pyan3
- **Graph Operations**: NetworkX
- **Diagram Generation**: python_mermaid
- **Testing**: pytest, pytest-cov
- **Linting**: ruff
- **Type Checking**: mypy
- **CI/CD**: GitHub Actions

---

## Progress Tracking

### Phase 0: Foundation
- [ ] 0.1.1: Initialize Git Repository
- [ ] 0.1.2: Python Package Structure
- [ ] 0.1.3: Development Dependencies
- [ ] 0.2.1: Pre-commit Hooks
- [ ] 0.2.2: CI/CD Pipeline
- [ ] 0.2.3: Logging Infrastructure

### Phase 1: Core Analysis Engine
- [ ] 1.1.1: Click CLI Setup
- [ ] 1.1.2: Configuration Module
- [ ] 1.2.1: Pyan3 Integration Wrapper
- [ ] 1.2.2: Custom AST Visitor
- [ ] 1.2.3: Symbol Registry
- [ ] 1.3.1: NetworkX Graph Builder
- [ ] 1.3.2: Graph Queries
- [ ] 1.3.3: Impact Analysis Algorithm

### Phase 2: Output Generation
- [ ] 2.1.1: Mermaid Module-Level Diagrams
- [ ] 2.1.2: Mermaid Function-Level Diagrams
- [ ] 2.1.3: Mermaid Focused Subgraphs
- [ ] 2.2.1: CODE_MAP.json Schema
- [ ] 2.2.2: CODE_MAP.json Generator
- [ ] 2.3.1: DevPlan Parser
- [ ] 2.3.2: Plan-to-Code Linker
- [ ] 2.3.3: DRIFT_REPORT.md Generator

### Phase 3: CLI Commands
- [ ] 3.1.1: Analyze Command
- [ ] 3.1.2: Impact Command
- [ ] 3.1.3: Graph Command
- [ ] 3.2.1: Sync Command
- [ ] 3.2.2: Drift Command
- [ ] 3.3.1: Git Hook Installation
- [ ] 3.3.2: Pre-commit Hook Script

### Phase 4: Integration & Polish
- [ ] 4.1.1: End-to-End Integration Tests
- [ ] 4.1.2: Performance Benchmarks
- [ ] 4.2.1: README Documentation
- [ ] 4.2.2: CLI Help Text
- [ ] 4.2.3: Example Project

### Phase 5: Cloud Deployment (AWS Free Tier)
- [ ] 5.1.1: FastAPI Application
- [ ] 5.1.2: Background Job Processing
- [ ] 5.1.3: Results Storage and Retrieval
- [ ] 5.2.1: EC2 Setup Script
- [ ] 5.2.2: Systemd Service Configuration
- [ ] 5.2.3: CloudFront HTTPS Configuration
- [ ] 5.3.1: GitHub Actions Deploy Workflow
- [ ] 5.3.2: S3 Results Backup
- [ ] 5.3.3: Production Checklist and Monitoring

**Current**: Phase 0
**Next**: 0.1.1

---

## Development Phases

## Phase 0: Foundation

**Goal**: Set up repository, package structure, and development tools
**Duration**: 1-2 days

### Task 0.1: Repository Setup

**Git**: Create branch `feature/0.1-repository-setup` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 0.1.1: Initialize Git Repository (2-3 hours)**

**Prerequisites**:
- None (first subtask)

**Deliverables**:
- [ ] Run `git init` to initialize repository
- [ ] Create `.gitignore` with Python standard ignores plus project-specific patterns
- [ ] Create `README.md` with project name, description, and badges placeholder
- [ ] Create `LICENSE` file with MIT license text
- [ ] Run `git add .` to stage all files
- [ ] Run `git commit -m 'chore: initial repository setup'`

**Technology Decisions**:
- Use MIT license for open-source compatibility
- Follow semantic commit convention from the start
- Include `.codemap/` directory in gitignore for future cache files

**Files to Create**:
- `.gitignore`
- `README.md`
- `LICENSE`

**Files to Modify**:
- None

**Success Criteria**:
- [ ] `.gitignore` includes: `__pycache__/`, `*.pyc`, `.venv/`, `dist/`, `build/`, `.env`, `.codemap/`, `*.egg-info/`
- [ ] README.md has `# CodeMap` heading
- [ ] README.md has one-sentence description: "Code impact analyzer and dependency mapper for Python projects"
- [ ] README.md has placeholder sections: Description, Installation, Usage, Development
- [ ] LICENSE file contains full MIT license text with current year
- [ ] First commit exists with semantic message format
- [ ] `git status` shows clean working tree after commit

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (infrastructure)
- **Build**: N/A (infrastructure)
- **Branch**: feature/0.1-repository-setup
- **Notes**: (any additional context)

---

**Subtask 0.1.2: Python Package Structure (2-3 hours)**

**Prerequisites**:
- [x] 0.1.1: Initialize Git Repository

**Deliverables**:
- [ ] Create `codemap/` package directory
- [ ] Create `codemap/__init__.py` with `__version__ = '0.1.0'` and module docstring
- [ ] Create `codemap/cli.py` with placeholder Click group
- [ ] Create `codemap/analyzer/` subpackage directory
- [ ] Create `codemap/analyzer/__init__.py` with empty exports
- [ ] Create `codemap/output/` subpackage directory
- [ ] Create `codemap/output/__init__.py` with empty exports
- [ ] Create `tests/` directory with `__init__.py`
- [ ] Create `pyproject.toml` with full project metadata

**Technology Decisions**:
- Package name for PyPI: `codemap`
- Module structure: `codemap.analyzer` for AST/graph, `codemap.output` for generators
- Use pyproject.toml (PEP 517/518) exclusively, no setup.py

**Files to Create**:
- `codemap/__init__.py`
- `codemap/cli.py`
- `codemap/analyzer/__init__.py`
- `codemap/output/__init__.py`
- `tests/__init__.py`
- `pyproject.toml`

**Files to Modify**:
- None

**Success Criteria**:
- [ ] `python -c "import codemap; print(codemap.__version__)"` prints '0.1.0'
- [ ] `python -c "from codemap import analyzer, output"` succeeds
- [ ] `pyproject.toml` has `[project]` section with name, version, description, authors
- [ ] `pyproject.toml` has `[project.scripts]` with `codemap = "codemap.cli:cli"`
- [ ] `pyproject.toml` has `dependencies` array with click, pyan3, networkx, python-mermaid
- [ ] `codemap/__init__.py` has module docstring explaining purpose
- [ ] Directory structure matches: `codemap/{__init__,cli,analyzer/,output/}`

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (structure only)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/0.1-repository-setup
- **Notes**: (any additional context)

---

**Subtask 0.1.3: Development Dependencies (2-3 hours)**

**Prerequisites**:
- [x] 0.1.2: Python Package Structure

**Deliverables**:
- [ ] Add `[project.optional-dependencies]` section to pyproject.toml
- [ ] Define `dev` extras: pytest, pytest-cov, ruff, mypy, pre-commit
- [ ] Create virtual environment: `python -m venv .venv`
- [ ] Activate venv and run `pip install -e ".[dev]"`
- [ ] Verify all imports work: click, pyan, networkx, python_mermaid
- [ ] Update README.md with development setup instructions
- [ ] Create `requirements-dev.txt` for explicit pinning (optional fallback)

**Technology Decisions**:
- Use optional-dependencies for dev tools
- Include ruff for linting (replaces flake8+black+isort)
- Include mypy for strict type checking
- Pin major versions only in pyproject.toml, allow flexibility

**Files to Create**:
- `requirements-dev.txt` (optional)

**Files to Modify**:
- `pyproject.toml`
- `README.md`

**Success Criteria**:
- [ ] `pip install -e ".[dev]"` completes with exit code 0
- [ ] `python -c "import click; import pyan; import networkx"` succeeds
- [ ] `python -c "from python_mermaid.diagram import MermaidDiagram"` succeeds
- [ ] `ruff --version` prints version number
- [ ] `mypy --version` prints version number
- [ ] `pytest --version` prints version number
- [ ] README has clear dev setup instructions with venv activation

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (dependencies)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/0.1-repository-setup
- **Notes**: (any additional context)

---

### Task 0.2: Development Tools

**Git**: Create branch `feature/0.2-development-tools` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 0.2.1: Pre-commit Hooks (2-3 hours)**

**Prerequisites**:
- [x] 0.1.3: Development Dependencies

**Deliverables**:
- [ ] Create `.pre-commit-config.yaml` with repos list
- [ ] Add ruff hook for `ruff check --fix` and `ruff format`
- [ ] Add mypy hook with project-specific config
- [ ] Add trailing-whitespace and end-of-file-fixer hooks
- [ ] Add `[tool.ruff]` section to pyproject.toml with line-length=100, target Python 3.11
- [ ] Add `[tool.mypy]` section to pyproject.toml with strict settings
- [ ] Run `pre-commit install` to set up git hooks
- [ ] Run `pre-commit run --all-files` to verify setup

**Technology Decisions**:
- Use ruff for both linting and formatting
- Run mypy in strict mode for maximum type safety
- Line length 100 (balance readability and screen width)

**Files to Create**:
- `.pre-commit-config.yaml`

**Files to Modify**:
- `pyproject.toml`

**Success Criteria**:
- [ ] `.pre-commit-config.yaml` exists with valid YAML syntax
- [ ] `pre-commit install` completes without errors
- [ ] `pre-commit run --all-files` passes on clean codebase
- [ ] `ruff check .` exits with code 0
- [ ] `ruff format --check .` exits with code 0
- [ ] `mypy codemap/` exits with code 0 (or expected issues only)
- [ ] Git commit triggers pre-commit hooks automatically

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (tooling)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/0.2-development-tools
- **Notes**: (any additional context)

---

**Subtask 0.2.2: CI/CD Pipeline (2-3 hours)**

**Prerequisites**:
- [x] 0.2.1: Pre-commit Hooks

**Deliverables**:
- [ ] Create `.github/workflows/` directory
- [ ] Create `.github/workflows/ci.yml` with workflow definition
- [ ] Define `test` job: checkout, setup-python 3.11, install deps, pytest with coverage
- [ ] Define `lint` job: checkout, setup-python, ruff check and format check
- [ ] Define `typecheck` job: checkout, setup-python, mypy
- [ ] Configure workflow triggers: push to main, pull_request to main
- [ ] Add CI status badge to README.md header
- [ ] Add coverage badge placeholder to README.md

**Technology Decisions**:
- Use GitHub Actions for CI/CD
- Run jobs in parallel for faster feedback
- Target Python 3.11 only (simplify for now)

**Files to Create**:
- `.github/workflows/ci.yml`

**Files to Modify**:
- `README.md`

**Success Criteria**:
- [ ] `.github/workflows/ci.yml` has valid YAML syntax (validate with `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`)
- [ ] Workflow triggers on push and pull_request to main
- [ ] Test job runs `pytest tests/ -v --cov=codemap --cov-report=xml`
- [ ] Lint job runs `ruff check . && ruff format --check .`
- [ ] Type check job runs `mypy codemap/`
- [ ] All jobs use `ubuntu-latest` runner
- [ ] README has CI badge: `![CI](https://github.com/USER/codemap/actions/workflows/ci.yml/badge.svg)`

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (infrastructure)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/0.2-development-tools
- **Notes**: (any additional context)

---

**Subtask 0.2.3: Logging Infrastructure (2-3 hours)**

**Prerequisites**:
- [x] 0.2.2: CI/CD Pipeline

**Deliverables**:
- [ ] Create `codemap/logging_config.py` with centralized logging setup
- [ ] Implement `setup_logging(level: str, log_file: Optional[Path])` function
- [ ] Define log format with timestamp, level, module, message
- [ ] Add console handler with colored output (optional: colorlog)
- [ ] Add optional file handler for persistent logs
- [ ] Export `get_logger(name: str)` function for module-level loggers
- [ ] Write test `tests/test_logging.py` to verify configuration

**Technology Decisions**:
- Use standard library `logging` module
- Support both console and file output
- Default to INFO level, DEBUG via --verbose flag

**Files to Create**:
- `codemap/logging_config.py`
- `tests/test_logging.py`

**Files to Modify**:
- None

**Success Criteria**:
- [ ] `setup_logging('DEBUG')` configures root logger correctly
- [ ] `get_logger('codemap.analyzer')` returns named logger
- [ ] Log output includes timestamp in ISO format
- [ ] Log output includes module name
- [ ] File handler creates log file when path provided
- [ ] Test verifies log messages captured correctly
- [ ] `pytest tests/test_logging.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/0.2-development-tools
- **Notes**: (any additional context)

---

## Phase 1: Core Analysis Engine

**Goal**: Implement AST analysis and graph building
**Duration**: 3-4 days

### Task 1.1: CLI Entry Point

**Git**: Create branch `feature/1.1-cli-entry-point` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 1.1.1: Click CLI Setup (2-3 hours)**

**Prerequisites**:
- [x] 0.2.3: Logging Infrastructure

**Deliverables**:
- [ ] Implement `cli()` function with `@click.group()` decorator
- [ ] Add `--version` option using `@click.version_option()`
- [ ] Add `--verbose/-v` option to enable DEBUG logging
- [ ] Add `--quiet/-q` option to suppress INFO logging
- [ ] Integrate logging setup in cli() callback
- [ ] Update `[project.scripts]` in pyproject.toml if needed
- [ ] Reinstall package: `pip install -e .`
- [ ] Write test `tests/test_cli.py` for CLI invocation

**Technology Decisions**:
- Use Click for CLI framework (mature, well-documented)
- Use command group pattern for extensibility
- Import version from __init__.py (single source of truth)

**Files to Create**:
- `tests/test_cli.py`

**Files to Modify**:
- `codemap/cli.py`
- `pyproject.toml` (if needed)

**Success Criteria**:
- [ ] `codemap --version` prints version from `__version__`
- [ ] `codemap --help` shows group help with options listed
- [ ] `codemap -v` enables DEBUG level logging
- [ ] `codemap -q` suppresses INFO messages
- [ ] `codemap` with no args shows help (not error)
- [ ] Exit code is 0 for --help and --version
- [ ] `pytest tests/test_cli.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.1-cli-entry-point
- **Notes**: (any additional context)

---

**Subtask 1.1.2: Configuration Module (2-3 hours)**

**Prerequisites**:
- [x] 1.1.1: Click CLI Setup

**Deliverables**:
- [ ] Create `codemap/config.py` with `CodeMapConfig` dataclass
- [ ] Define config fields: source_dir, output_dir, exclude_patterns, include_tests
- [ ] Implement `load_config(path: Optional[Path])` to read `.codemap.toml` or `pyproject.toml`
- [ ] Implement `CodeMapConfig.from_cli_args()` factory for CLI overrides
- [ ] Support config precedence: CLI args > config file > defaults
- [ ] Write test `tests/test_config.py` for config loading
- [ ] Document config options in README.md

**Technology Decisions**:
- Use TOML for config file (consistent with pyproject.toml)
- Use dataclass for type-safe config
- Support config in pyproject.toml under `[tool.codemap]`

**Files to Create**:
- `codemap/config.py`
- `tests/test_config.py`

**Files to Modify**:
- `README.md`

**Success Criteria**:
- [ ] `CodeMapConfig` dataclass has all required fields with defaults
- [ ] `load_config()` reads from `.codemap.toml` if present
- [ ] `load_config()` falls back to `pyproject.toml [tool.codemap]`
- [ ] CLI args override config file values
- [ ] Missing config file uses defaults without error
- [ ] `pytest tests/test_config.py -v` passes
- [ ] Type hints pass mypy strict mode

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.1-cli-entry-point
- **Notes**: (any additional context)

---

### Task 1.2: AST Analysis

**Git**: Create branch `feature/1.2-ast-analysis` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 1.2.1: Pyan3 Integration Wrapper (2-4 hours)**

**Prerequisites**:
- [x] 1.1.2: Configuration Module

**Reference Documentation**:
- pyan3 GitHub: https://github.com/Technologicat/pyan
- pyan3 PyPI: https://pypi.org/project/pyan3/
- Key class: `pyan.CallGraphVisitor` - visits Python AST and builds call graph
- Key method: `CallGraphVisitor.process()` - processes files and returns graph data
- Example usage:
  ```python
  from pyan import CallGraphVisitor
  visitor = CallGraphVisitor(filenames, logger=logger)
  # visitor.defines contains defined symbols
  # visitor.uses contains usage relationships
  ```

**Deliverables**:
- [ ] Create `codemap/analyzer/pyan_wrapper.py`
- [ ] Implement `PyanAnalyzer` class wrapping pyan3 functionality
- [ ] Implement `analyze_files(file_paths: List[Path]) -> CallGraph` method
- [ ] Handle pyan3 exceptions gracefully with logging
- [ ] Support file filtering based on config exclude_patterns
- [ ] Write test `tests/analyzer/test_pyan_wrapper.py` with sample Python files
- [ ] Create `tests/fixtures/` directory with sample Python code for testing

**Technology Decisions**:
- Wrap pyan3 to isolate its API and allow future replacement
- Return our own CallGraph type (not pyan internals)
- Log warnings for files that fail parsing

**Files to Create**:
- `codemap/analyzer/pyan_wrapper.py`
- `tests/analyzer/__init__.py`
- `tests/analyzer/test_pyan_wrapper.py`
- `tests/fixtures/sample_module.py`
- `tests/fixtures/sample_caller.py`

**Files to Modify**:
- `codemap/analyzer/__init__.py`

**Success Criteria**:
- [ ] `PyanAnalyzer` class can be instantiated
- [ ] `analyze_files()` returns CallGraph with nodes and edges
- [ ] Sample fixture files are analyzed correctly
- [ ] ParseError in one file doesn't crash entire analysis
- [ ] Excluded patterns are respected
- [ ] `pytest tests/analyzer/test_pyan_wrapper.py -v` passes
- [ ] Type hints pass mypy

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.2-ast-analysis
- **Notes**: (any additional context)

---

**Subtask 1.2.2: Custom AST Visitor (3-4 hours)**

**Prerequisites**:
- [x] 1.2.1: Pyan3 Integration Wrapper

**Deliverables**:
- [ ] Create `codemap/analyzer/ast_visitor.py`
- [ ] Implement `CodeMapVisitor(ast.NodeVisitor)` class
- [ ] Extract function definitions with signatures and docstrings
- [ ] Extract class definitions with bases and methods
- [ ] Extract import statements (absolute and relative)
- [ ] Track call sites with source locations (file:line)
- [ ] Write test `tests/analyzer/test_ast_visitor.py`
- [ ] Handle async functions and methods

**Technology Decisions**:
- Use Python's ast module directly for fine-grained control
- Complement pyan3 with additional metadata extraction
- Store source locations for IDE integration

**Files to Create**:
- `codemap/analyzer/ast_visitor.py`
- `tests/analyzer/test_ast_visitor.py`

**Files to Modify**:
- `codemap/analyzer/__init__.py`

**Success Criteria**:
- [ ] Visitor extracts all function definitions from sample code
- [ ] Visitor extracts all class definitions with inheritance
- [ ] Visitor tracks import statements and aliases
- [ ] Call sites include file path and line number
- [ ] Async def and async methods are handled
- [ ] Decorators are captured
- [ ] `pytest tests/analyzer/test_ast_visitor.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.2-ast-analysis
- **Notes**: (any additional context)

---

**Subtask 1.2.3: Symbol Registry (2-3 hours)**

**Prerequisites**:
- [x] 1.2.2: Custom AST Visitor

**Deliverables**:
- [ ] Create `codemap/analyzer/symbols.py`
- [ ] Implement `Symbol` dataclass: name, kind (function/class/module), location, docstring
- [ ] Implement `SymbolRegistry` class with add, get, search methods

**Skeleton Code** (implement in `codemap/analyzer/symbols.py`):
```python
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional


class SymbolKind(Enum):
    """Kind of symbol in the codebase."""
    MODULE = "module"
    CLASS = "class"
    FUNCTION = "function"
    METHOD = "method"


@dataclass(frozen=True)
class SourceLocation:
    """Location of a symbol in source code."""
    file: Path
    line: int
    column: int = 0


@dataclass(frozen=True)
class Symbol:
    """A code symbol (function, class, module) in the analyzed codebase."""
    name: str
    qualified_name: str
    kind: SymbolKind
    location: SourceLocation
    docstring: Optional[str] = None
    signature: Optional[str] = None


class SymbolRegistry:
    """Registry for storing and querying code symbols."""

    def __init__(self) -> None:
        self._by_name: dict[str, Symbol] = {}
        self._by_location: dict[tuple[Path, int], Symbol] = {}

    def add(self, symbol: Symbol) -> None:
        """Add a symbol to the registry."""
        ...

    def get(self, qualified_name: str) -> Optional[Symbol]:
        """Get a symbol by its qualified name."""
        ...

    def search(self, pattern: str) -> list[Symbol]:
        """Search for symbols matching a glob pattern."""
        ...

    def get_by_location(self, file: Path, line: int) -> Optional[Symbol]:
        """Get a symbol at a specific source location."""
        ...
```
- [ ] Implement `qualified_name(symbol)` returning `module.class.method` format
- [ ] Implement `search(pattern: str)` with glob-style matching
- [ ] Implement `get_by_location(file: Path, line: int)` lookup
- [ ] Write test `tests/analyzer/test_symbols.py`

**Technology Decisions**:
- Use qualified names for unique symbol identification
- Support glob patterns for flexible querying
- Index by both name and location for different lookup needs

**Files to Create**:
- `codemap/analyzer/symbols.py`
- `tests/analyzer/test_symbols.py`

**Files to Modify**:
- `codemap/analyzer/__init__.py`

**Success Criteria**:
- [ ] `Symbol` dataclass is immutable (frozen=True)
- [ ] `SymbolRegistry` stores and retrieves symbols by qualified name
- [ ] `search('*.validate*')` matches `auth.validate_user`
- [ ] `get_by_location()` returns symbol at specific file:line
- [ ] Duplicate symbol names handled (overwrite with warning)
- [ ] `pytest tests/analyzer/test_symbols.py -v` passes
- [ ] All classes have type hints

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.2-ast-analysis
- **Notes**: (any additional context)

---

### Task 1.3: Graph Operations

**Git**: Create branch `feature/1.3-graph-operations` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 1.3.1: NetworkX Graph Builder (3-4 hours)**

**Prerequisites**:
- [x] 1.2.3: Symbol Registry

**Deliverables**:
- [ ] Create `codemap/analyzer/graph.py`
- [ ] Implement `DependencyGraph` class wrapping `networkx.DiGraph`
- [ ] Implement `add_symbol(symbol: Symbol)` adding node with attributes
- [ ] Implement `add_dependency(from_sym: str, to_sym: str, kind: str)` adding edge
- [ ] Implement `build_from_analysis(pyan_result, symbols)` factory method
- [ ] Store node attributes: kind, location, docstring
- [ ] Store edge attributes: kind (calls, imports, inherits), locations
- [ ] Write test `tests/analyzer/test_graph.py`

**Technology Decisions**:
- Use NetworkX DiGraph for directed dependency representation
- Edge kinds: "calls", "imports", "inherits"
- Support multiple edges between same nodes (MultiDiGraph if needed)

**Files to Create**:
- `codemap/analyzer/graph.py`
- `tests/analyzer/test_graph.py`

**Files to Modify**:
- `codemap/analyzer/__init__.py`

**Success Criteria**:
- [ ] `DependencyGraph` wraps NetworkX DiGraph
- [ ] Nodes have kind, location, docstring attributes
- [ ] Edges have kind and locations list attributes
- [ ] `build_from_analysis()` creates graph from pyan + symbols
- [ ] Graph is serializable (for caching)
- [ ] `pytest tests/analyzer/test_graph.py -v` passes
- [ ] Type hints complete

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.3-graph-operations
- **Notes**: (any additional context)

---

**Subtask 1.3.2: Graph Queries (2-3 hours)**

**Prerequisites**:
- [x] 1.3.1: NetworkX Graph Builder

**Deliverables**:
- [ ] Add `get_callers(symbol: str) -> List[str]` method to DependencyGraph
- [ ] Add `get_callees(symbol: str) -> List[str]` method
- [ ] Add `get_ancestors(symbol: str, depth: int) -> List[str]` method (upstream)
- [ ] Add `get_descendants(symbol: str, depth: int) -> List[str]` method (downstream)
- [ ] Add `get_module_dependencies(module: str) -> List[str]` method
- [ ] Add `find_cycles() -> List[List[str]]` method using NetworkX
- [ ] Write test `tests/analyzer/test_graph_queries.py`

**Technology Decisions**:
- Use NetworkX algorithms for cycle detection, ancestors, descendants
- Default depth=None for unlimited traversal
- Return qualified names for all query results

**Files to Create**:
- `tests/analyzer/test_graph_queries.py`

**Files to Modify**:
- `codemap/analyzer/graph.py`

**Success Criteria**:
- [ ] `get_callers('auth.validate')` returns list of callers
- [ ] `get_callees('main.run')` returns list of called functions
- [ ] `get_ancestors()` with depth=2 limits traversal
- [ ] `get_descendants()` includes transitive dependencies
- [ ] `find_cycles()` returns empty list for acyclic graphs
- [ ] `find_cycles()` returns cycle paths for cyclic graphs
- [ ] `pytest tests/analyzer/test_graph_queries.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.3-graph-operations
- **Notes**: (any additional context)

---

**Subtask 1.3.3: Impact Analysis Algorithm (3-4 hours)**

**Prerequisites**:
- [x] 1.3.2: Graph Queries

**Deliverables**:
- [ ] Create `codemap/analyzer/impact.py`
- [ ] Implement `ImpactAnalyzer` class
- [ ] Implement `analyze_impact(symbols: List[str]) -> ImpactReport` method
- [ ] `ImpactReport` dataclass: affected_symbols, affected_files, risk_score

**Skeleton Code** (implement in `codemap/analyzer/impact.py`):
```python
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codemap.analyzer.graph import DependencyGraph


@dataclass
class ImpactReport:
    """Report of impact analysis for changed symbols."""

    # Symbols directly or transitively affected by the changes
    affected_symbols: list[str] = field(default_factory=list)

    # Unique files containing affected symbols
    affected_files: list[Path] = field(default_factory=list)

    # Risk score from 0-100 based on impact severity
    # Factors: count of affected symbols, depth of impact, test coverage
    risk_score: int = 0

    # Suggested test files to run based on affected symbols
    suggested_tests: list[Path] = field(default_factory=list)

    # Breakdown of direct vs transitive impacts
    direct_impacts: list[str] = field(default_factory=list)
    transitive_impacts: list[str] = field(default_factory=list)


class ImpactAnalyzer:
    """Analyzes the impact of changes to code symbols."""

    def __init__(self, graph: DependencyGraph) -> None:
        self._graph = graph

    def analyze_impact(
        self,
        symbols: list[str],
        max_depth: int | None = None,
    ) -> ImpactReport:
        """Analyze impact of changes to the specified symbols."""
        ...

    def suggest_test_files(self, affected: list[str]) -> list[Path]:
        """Suggest test files to run based on affected symbols."""
        ...

    def _calculate_risk_score(
        self,
        affected: list[str],
        depth: int,
        has_tests: bool,
    ) -> int:
        """Calculate risk score (0-100) based on impact factors."""
        ...
```
- [ ] Calculate risk_score based on: number affected, depth of impact, presence of tests
- [ ] Implement `suggest_test_files(affected: List[str]) -> List[Path]` heuristic
- [ ] Write test `tests/analyzer/test_impact.py`

**Technology Decisions**:
- Risk score: weighted sum of factors (0-100 scale)
- Test file heuristic: look for `test_` prefix matching affected modules
- Include both direct and transitive impacts

**Files to Create**:
- `codemap/analyzer/impact.py`
- `tests/analyzer/test_impact.py`

**Files to Modify**:
- `codemap/analyzer/__init__.py`

**Success Criteria**:
- [ ] `ImpactAnalyzer` takes DependencyGraph in constructor
- [ ] `analyze_impact(['auth.validate'])` returns ImpactReport
- [ ] `affected_symbols` includes transitive dependents
- [ ] `affected_files` lists unique file paths
- [ ] `risk_score` is integer 0-100
- [ ] `suggest_test_files()` returns plausible test paths
- [ ] `pytest tests/analyzer/test_impact.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/1.3-graph-operations
- **Notes**: (any additional context)

---

## Phase 2: Output Generation

**Goal**: Generate Mermaid diagrams, CODE_MAP.json, and DRIFT_REPORT.md
**Duration**: 3-4 days

### Task 2.1: Mermaid Diagrams

**Git**: Create branch `feature/2.1-mermaid-diagrams` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 2.1.1: Mermaid Module-Level Diagrams (3-4 hours)**

**Prerequisites**:
- [x] 1.3.3: Impact Analysis Algorithm

**Deliverables**:
- [ ] Create `codemap/output/mermaid.py`
- [ ] Implement `MermaidGenerator` class
- [ ] Implement `generate_module_diagram(graph: DependencyGraph) -> str` method
- [ ] Generate flowchart TD (top-down) layout
- [ ] Color-code nodes by module depth (darker = deeper nesting)
- [ ] Add click handlers for node selection (Mermaid interactive)
- [ ] Write test `tests/output/test_mermaid.py`
- [ ] Create sample output in `examples/` directory

**Technology Decisions**:
- Use python_mermaid library for diagram generation
- Flowchart TD layout for module hierarchy
- Include subgraphs for package grouping

**Files to Create**:
- `codemap/output/mermaid.py`
- `tests/output/__init__.py`
- `tests/output/test_mermaid.py`
- `examples/module_diagram.mermaid`

**Files to Modify**:
- `codemap/output/__init__.py`

**Success Criteria**:
- [ ] `generate_module_diagram()` returns valid Mermaid syntax
- [ ] Output starts with `flowchart TD`
- [ ] Nodes use valid Mermaid identifiers (no special chars)
- [ ] Edges show import relationships
- [ ] Subgraphs group by top-level package
- [ ] Sample output renders in Mermaid Live Editor
- [ ] `pytest tests/output/test_mermaid.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.1-mermaid-diagrams
- **Notes**: (any additional context)

---

**Subtask 2.1.2: Mermaid Function-Level Diagrams (2-3 hours)**

**Prerequisites**:
- [x] 2.1.1: Mermaid Module-Level Diagrams

**Deliverables**:
- [ ] Add `generate_function_diagram(graph, module: str) -> str` method
- [ ] Show functions within a single module
- [ ] Include call edges between functions
- [ ] Show external calls as dashed edges
- [ ] Add method signatures in node labels (truncated)
- [ ] Write additional tests in `tests/output/test_mermaid.py`
- [ ] Create sample output `examples/function_diagram.mermaid`

**Technology Decisions**:
- Function diagrams scoped to single module (readability)
- External calls shown but not expanded
- Truncate signatures longer than 40 chars

**Files to Create**:
- `examples/function_diagram.mermaid`

**Files to Modify**:
- `codemap/output/mermaid.py`
- `tests/output/test_mermaid.py`

**Success Criteria**:
- [ ] `generate_function_diagram(graph, 'auth')` returns functions in auth module
- [ ] Internal calls shown as solid edges
- [ ] External calls shown as dashed edges (`-.->`)
- [ ] Node labels include `func_name(args...)`
- [ ] Long signatures truncated with `...`
- [ ] Sample output renders correctly
- [ ] Tests pass

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.1-mermaid-diagrams
- **Notes**: (any additional context)

---

**Subtask 2.1.3: Mermaid Focused Subgraphs (2-3 hours)**

**Prerequisites**:
- [x] 2.1.2: Mermaid Function-Level Diagrams

**Deliverables**:
- [ ] Add `generate_impact_diagram(graph, symbols: List[str], depth: int) -> str`
- [ ] Center diagram on specified symbols
- [ ] Show upstream (callers) and downstream (callees) to depth
- [ ] Highlight the focal symbols with different style
- [ ] Add legend explaining node colors
- [ ] Write tests for impact diagram generation
- [ ] Create sample `examples/impact_diagram.mermaid`

**Technology Decisions**:
- Focal symbols highlighted with thick border
- Upstream nodes colored blue, downstream colored green
- Legend as a separate subgraph

**Files to Create**:
- `examples/impact_diagram.mermaid`

**Files to Modify**:
- `codemap/output/mermaid.py`
- `tests/output/test_mermaid.py`

**Success Criteria**:
- [ ] `generate_impact_diagram(graph, ['auth.validate'], depth=2)` works
- [ ] Focal symbols have distinct style (e.g., `:::focal`)
- [ ] Only nodes within depth shown
- [ ] Direction of edges indicates dependency direction
- [ ] Legend subgraph explains colors
- [ ] Sample renders correctly
- [ ] Tests pass

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.1-mermaid-diagrams
- **Notes**: (any additional context)

---

### Task 2.2: CODE_MAP.json

**Git**: Create branch `feature/2.2-code-map-json` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 2.2.1: CODE_MAP.json Schema (2-3 hours)**

**Prerequisites**:
- [x] 2.1.3: Mermaid Focused Subgraphs

**Deliverables**:
- [ ] Create `codemap/output/schemas.py`
- [ ] Define `CodeMapSchema` as TypedDict or Pydantic model
- [ ] Schema includes: version, generated_at, source_root, symbols[], dependencies[]
- [ ] `symbols[]` items: qualified_name, kind, file, line, docstring
- [ ] `dependencies[]` items: from, to, kind, locations[]
- [ ] Create JSON Schema file `schemas/code_map.schema.json`
- [ ] Write validation tests `tests/output/test_schemas.py`

**Technology Decisions**:
- Use TypedDict for schema (no Pydantic dependency)
- Include JSON Schema for external validation
- Version field for future schema evolution

**Files to Create**:
- `codemap/output/schemas.py`
- `schemas/code_map.schema.json`
- `tests/output/test_schemas.py`

**Files to Modify**:
- `codemap/output/__init__.py`

**Success Criteria**:
- [ ] `CodeMapSchema` TypedDict defines all required fields
- [ ] JSON Schema validates sample CODE_MAP.json
- [ ] Schema includes `$schema` and `version` fields
- [ ] All symbol fields are documented
- [ ] All dependency fields are documented
- [ ] Tests verify schema validation
- [ ] Type hints complete

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.2-code-map-json
- **Notes**: (any additional context)

---

**Subtask 2.2.2: CODE_MAP.json Generator (2-3 hours)**

**Prerequisites**:
- [x] 2.2.1: CODE_MAP.json Schema

**Deliverables**:
- [ ] Create `codemap/output/code_map.py`
- [ ] Implement `CodeMapGenerator` class
- [ ] Implement `generate(graph: DependencyGraph, registry: SymbolRegistry) -> dict`
- [ ] Implement `save(data: dict, path: Path)` with pretty-printed JSON
- [ ] Implement `load(path: Path) -> dict` for reading existing maps
- [ ] Add schema validation in `save()` and `load()`
- [ ] Write test `tests/output/test_code_map.py`

**Technology Decisions**:
- Pretty-print JSON with indent=2 for readability
- Validate against schema before writing
- Sort keys for deterministic output (better git diffs)

**Files to Create**:
- `codemap/output/code_map.py`
- `tests/output/test_code_map.py`

**Files to Modify**:
- `codemap/output/__init__.py`

**Success Criteria**:
- [ ] `generate()` produces dict matching CodeMapSchema
- [ ] `save()` writes valid JSON file
- [ ] `load()` reads and validates JSON file
- [ ] Output is deterministic (same input = same output)
- [ ] Invalid schema raises ValidationError
- [ ] Tests cover generate, save, load cycle
- [ ] Tests pass

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.2-code-map-json
- **Notes**: (any additional context)

---

### Task 2.3: DevPlan Integration

**Git**: Create branch `feature/2.3-devplan-integration` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 2.3.1: DevPlan Parser (3-4 hours)**

**Prerequisites**:
- [x] 2.2.2: CODE_MAP.json Generator

**Deliverables**:
- [ ] Create `codemap/output/devplan_parser.py`
- [ ] Implement `DevPlanParser` class
- [ ] Implement `parse(path: Path) -> DevPlan` method
- [ ] `DevPlan` dataclass: phases[], tasks[], subtasks[]

**Skeleton Code** (implement in `codemap/output/devplan_parser.py`):
```python
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import re


@dataclass
class Deliverable:
    """A deliverable item from a subtask."""
    text: str
    completed: bool = False


@dataclass
class Subtask:
    """A subtask from the development plan (X.Y.Z format)."""
    id: str  # e.g., "1.2.3"
    title: str
    deliverables: list[Deliverable] = field(default_factory=list)
    files_to_create: list[str] = field(default_factory=list)
    files_to_modify: list[str] = field(default_factory=list)
    completed: bool = False


@dataclass
class Task:
    """A task containing multiple subtasks (X.Y format)."""
    id: str  # e.g., "1.2"
    title: str
    subtasks: list[Subtask] = field(default_factory=list)


@dataclass
class Phase:
    """A phase containing multiple tasks."""
    number: int  # e.g., 0, 1, 2
    title: str
    tasks: list[Task] = field(default_factory=list)


@dataclass
class DevPlan:
    """Parsed development plan."""
    project_name: str
    phases: list[Phase] = field(default_factory=list)

    def get_subtask(self, subtask_id: str) -> Optional[Subtask]:
        """Get a subtask by its ID (e.g., '1.2.3')."""
        ...

    def get_all_subtasks(self) -> list[Subtask]:
        """Get all subtasks in order."""
        ...


class DevPlanParser:
    """Parser for DEVELOPMENT_PLAN.md files."""

    # Regex patterns for parsing
    SUBTASK_ID_PATTERN = re.compile(r"(\d+\.\d+\.\d+)")
    CHECKBOX_PATTERN = re.compile(r"- \[([ xX])\] (.+)")

    def parse(self, path: Path) -> DevPlan:
        """Parse a DEVELOPMENT_PLAN.md file."""
        ...

    def _parse_phase(self, content: str) -> Phase:
        """Parse a phase section."""
        ...

    def _parse_subtask(self, content: str) -> Subtask:
        """Parse a subtask section."""
        ...

    def _extract_file_list(self, content: str, header: str) -> list[str]:
        """Extract file list from 'Files to Create' or 'Files to Modify' section."""
        ...
```
- [ ] Extract subtask IDs (X.Y.Z format)
- [ ] Extract deliverables with checkbox status
- [ ] Extract "Files to Create" and "Files to Modify" sections
- [ ] Write test `tests/output/test_devplan_parser.py` using sample DEVELOPMENT_PLAN.md

**Technology Decisions**:
- Use regex for ID extraction (simple, reliable)
- Parse markdown structure (headers, lists)
- Store raw text for unparseable sections

**Files to Create**:
- `codemap/output/devplan_parser.py`
- `tests/output/test_devplan_parser.py`
- `tests/fixtures/sample_devplan.md`

**Files to Modify**:
- `codemap/output/__init__.py`

**Success Criteria**:
- [ ] `parse()` returns DevPlan with all phases
- [ ] Subtask IDs extracted correctly (e.g., "1.2.3")
- [ ] Deliverables list captured with checkbox state
- [ ] "Files to Create" list parsed into List[str]
- [ ] "Files to Modify" list parsed into List[str]
- [ ] Invalid markdown doesn't crash parser
- [ ] Tests verify against sample fixture

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.3-devplan-integration
- **Notes**: (any additional context)

---

**Subtask 2.3.2: Plan-to-Code Linker (3-4 hours)**

**Prerequisites**:
- [x] 2.3.1: DevPlan Parser

**Deliverables**:
- [ ] Create `codemap/output/linker.py`
- [ ] Implement `PlanCodeLinker` class
- [ ] Implement `link(devplan: DevPlan, code_map: dict) -> PlanCodeMap`
- [ ] `PlanCodeMap`: bidirectional mapping subtask_id <-> symbols
- [ ] Match "Files to Create" paths to actual files
- [ ] Match function/class names mentioned in deliverables to symbols
- [ ] Implement `get_symbols_for_task(task_id: str) -> List[str]`
- [ ] Implement `get_tasks_for_symbol(symbol: str) -> List[str]`
- [ ] Write test `tests/output/test_linker.py`

**Technology Decisions**:
- Fuzzy matching for symbol names (handle typos)
- Store confidence score for each link
- Support manual overrides via comments in devplan

**Files to Create**:
- `codemap/output/linker.py`
- `tests/output/test_linker.py`

**Files to Modify**:
- `codemap/output/__init__.py`

**Success Criteria**:
- [ ] `link()` creates bidirectional mapping
- [ ] `get_symbols_for_task('1.2.1')` returns linked symbols
- [ ] `get_tasks_for_symbol('auth.validate')` returns task IDs
- [ ] File paths matched case-insensitively
- [ ] Unmatched items logged as warnings
- [ ] Tests verify bidirectional queries
- [ ] Tests pass

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.3-devplan-integration
- **Notes**: (any additional context)

---

**Subtask 2.3.3: DRIFT_REPORT.md Generator (3-4 hours)**

**Prerequisites**:
- [x] 2.3.2: Plan-to-Code Linker

**Deliverables**:
- [ ] Create `codemap/output/drift_report.py`
- [ ] Implement `DriftReportGenerator` class
- [ ] Implement `generate(plan_code_map: PlanCodeMap, code_map: dict) -> str`
- [ ] Report sections: Summary, Planned Not Implemented, Implemented Not Planned, Modified Files
- [ ] Include risk assessment for unplanned code
- [ ] Format as Markdown with tables
- [ ] Write test `tests/output/test_drift_report.py`
- [ ] Create sample `examples/DRIFT_REPORT.md`

**Technology Decisions**:
- Markdown format for consistency with DevPlan
- Tables for structured data
- Risk levels: Low, Medium, High based on impact analysis

**Files to Create**:
- `codemap/output/drift_report.py`
- `tests/output/test_drift_report.py`
- `examples/DRIFT_REPORT.md`

**Files to Modify**:
- `codemap/output/__init__.py`

**Success Criteria**:
- [ ] `generate()` returns valid Markdown string
- [ ] Summary section shows counts of drift items
- [ ] "Planned Not Implemented" lists missing symbols
- [ ] "Implemented Not Planned" lists unplanned code
- [ ] Tables use proper Markdown syntax
- [ ] Sample output renders correctly
- [ ] Tests verify all sections present

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/2.3-devplan-integration
- **Notes**: (any additional context)

---

## Phase 3: CLI Commands

**Goal**: Implement all CLI commands
**Duration**: 2-3 days

### Task 3.1: Analysis Commands

**Git**: Create branch `feature/3.1-analysis-commands` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 3.1.1: Analyze Command (3-4 hours)**

**Prerequisites**:
- [x] 2.3.3: DRIFT_REPORT.md Generator

**Deliverables**:
- [ ] Implement `@cli.command('analyze')` in cli.py
- [ ] Add `--source` option for source directory (default: current dir)
- [ ] Add `--output` option for output directory (default: .codemap/)
- [ ] Add `--exclude` option for exclude patterns (multiple allowed)
- [ ] Orchestrate: PyanAnalyzer -> SymbolRegistry -> DependencyGraph -> CodeMapGenerator
- [ ] Save CODE_MAP.json to output directory
- [ ] Generate and save ARCHITECTURE.mermaid
- [ ] Print summary to console
- [ ] Write test `tests/test_cli_analyze.py`

**Technology Decisions**:
- Default output to `.codemap/` (hidden directory)
- Progress output to stderr (stdout for machine-readable)
- Exit code 0 on success, 1 on errors

**Files to Create**:
- `tests/test_cli_analyze.py`

**Files to Modify**:
- `codemap/cli.py`

**Success Criteria**:
- [ ] `codemap analyze` runs without error on sample project
- [ ] `codemap analyze --source ./src` analyzes specified directory
- [ ] `.codemap/CODE_MAP.json` created with valid content
- [ ] `.codemap/ARCHITECTURE.mermaid` created
- [ ] Console output shows symbol count, file count
- [ ] `--exclude __pycache__` excludes matched files
- [ ] Tests verify file creation and content

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.1-analysis-commands
- **Notes**: (any additional context)

---

**Subtask 3.1.2: Impact Command (2-3 hours)**

**Prerequisites**:
- [x] 3.1.1: Analyze Command

**Deliverables**:
- [ ] Implement `@cli.command('impact')` in cli.py
- [ ] Add positional argument `symbols` (multiple allowed)
- [ ] Add `--depth` option for traversal depth (default: 3)
- [ ] Add `--format` option: text, json, mermaid (default: text)
- [ ] Load existing CODE_MAP.json from .codemap/
- [ ] Run ImpactAnalyzer on specified symbols
- [ ] Output affected symbols, files, risk score
- [ ] Write test `tests/test_cli_impact.py`

**Technology Decisions**:
- Require prior `analyze` run (fail gracefully if no CODE_MAP.json)
- Support symbol glob patterns (e.g., `auth.*`)
- Text format: human-readable, JSON format: machine-parseable

**Files to Create**:
- `tests/test_cli_impact.py`

**Files to Modify**:
- `codemap/cli.py`

**Success Criteria**:
- [ ] `codemap impact auth.validate` shows impact analysis
- [ ] `codemap impact 'auth.*'` expands glob pattern
- [ ] `--depth 1` limits to direct dependents only
- [ ] `--format json` outputs valid JSON
- [ ] `--format mermaid` outputs impact diagram
- [ ] Missing CODE_MAP.json gives helpful error message
- [ ] Tests verify all formats

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.1-analysis-commands
- **Notes**: (any additional context)

---

**Subtask 3.1.3: Graph Command (2-3 hours)**

**Prerequisites**:
- [x] 3.1.2: Impact Command

**Deliverables**:
- [ ] Implement `@cli.command('graph')` in cli.py
- [ ] Add `--level` option: module, function (default: module)
- [ ] Add `--module` option to focus on specific module
- [ ] Add `--output` option for output file (default: stdout)
- [ ] Add `--format` option: mermaid, dot (default: mermaid)
- [ ] Generate appropriate diagram based on options
- [ ] Write test `tests/test_cli_graph.py`

**Technology Decisions**:
- Default to stdout for piping to other tools
- Mermaid format for GitHub/GitLab rendering
- DOT format for Graphviz users

**Files to Create**:
- `tests/test_cli_graph.py`

**Files to Modify**:
- `codemap/cli.py`

**Success Criteria**:
- [ ] `codemap graph` outputs module-level Mermaid to stdout
- [ ] `codemap graph --level function --module auth` outputs function graph
- [ ] `codemap graph -o graph.mermaid` writes to file
- [ ] `codemap graph --format dot` outputs DOT format
- [ ] Output is valid for respective format
- [ ] Tests verify stdout and file output

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.1-analysis-commands
- **Notes**: (any additional context)

---

### Task 3.2: Integration Commands

**Git**: Create branch `feature/3.2-integration-commands` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 3.2.1: Sync Command (3-4 hours)**

**Prerequisites**:
- [x] 3.1.3: Graph Command

**Deliverables**:
- [ ] Implement `@cli.command('sync')` in cli.py
- [ ] Add `--devplan` option for DEVELOPMENT_PLAN.md path
- [ ] Add `--update-map` flag to update CODE_MAP.json with links
- [ ] Parse DevPlan using DevPlanParser
- [ ] Link using PlanCodeLinker
- [ ] Update CODE_MAP.json with task_links[] field
- [ ] Print sync summary: matched, unmatched, new
- [ ] Write test `tests/test_cli_sync.py`

**Technology Decisions**:
- Non-destructive by default (require --update-map to write)
- Add task_links to CODE_MAP.json symbols
- Report confidence scores for uncertain matches

**Files to Create**:
- `tests/test_cli_sync.py`

**Files to Modify**:
- `codemap/cli.py`
- `codemap/output/code_map.py` (add task_links field)

**Success Criteria**:
- [ ] `codemap sync --devplan DEVELOPMENT_PLAN.md` parses and links
- [ ] Dry run (no --update-map) only prints summary
- [ ] `--update-map` writes task_links to CODE_MAP.json
- [ ] Summary shows matched/unmatched counts
- [ ] Low-confidence matches flagged in output
- [ ] Tests verify both dry run and update modes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.2-integration-commands
- **Notes**: (any additional context)

---

**Subtask 3.2.2: Drift Command (2-3 hours)**

**Prerequisites**:
- [x] 3.2.1: Sync Command

**Deliverables**:
- [ ] Implement `@cli.command('drift')` in cli.py
- [ ] Add `--devplan` option for DEVELOPMENT_PLAN.md path
- [ ] Add `--output` option for DRIFT_REPORT.md path (default: stdout)
- [ ] Add `--format` option: markdown, json (default: markdown)
- [ ] Use DriftReportGenerator to create report
- [ ] Exit code 0 if no drift, 1 if drift detected
- [ ] Write test `tests/test_cli_drift.py`

**Technology Decisions**:
- Non-zero exit for CI integration
- Markdown default for human review
- JSON format for programmatic consumption

**Files to Create**:
- `tests/test_cli_drift.py`

**Files to Modify**:
- `codemap/cli.py`

**Success Criteria**:
- [ ] `codemap drift --devplan DEVELOPMENT_PLAN.md` outputs report
- [ ] Exit code 0 when code matches plan
- [ ] Exit code 1 when drift detected
- [ ] `-o DRIFT_REPORT.md` writes to file
- [ ] `--format json` outputs valid JSON
- [ ] Tests verify exit codes for both cases

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.2-integration-commands
- **Notes**: (any additional context)

---

### Task 3.3: Git Integration

**Git**: Create branch `feature/3.3-git-integration` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 3.3.1: Git Hook Installation (2-3 hours)**

**Prerequisites**:
- [x] 3.2.2: Drift Command

**Deliverables**:
- [ ] Implement `@cli.command('install-hooks')` in cli.py
- [ ] Add `--pre-commit` flag to install pre-commit hook
- [ ] Add `--post-commit` flag to install post-commit hook
- [ ] Create hook scripts in `.git/hooks/`
- [ ] Make hook scripts executable
- [ ] Handle existing hooks (backup, append, or fail)
- [ ] Add `--uninstall` flag to remove hooks
- [ ] Write test `tests/test_cli_hooks.py`

**Technology Decisions**:
- Install to `.git/hooks/` directly (simple)
- Support integration with existing pre-commit framework
- Backup existing hooks before overwriting

**Files to Create**:
- `tests/test_cli_hooks.py`

**Files to Modify**:
- `codemap/cli.py`

**Success Criteria**:
- [ ] `codemap install-hooks --pre-commit` creates .git/hooks/pre-commit
- [ ] Hook script is executable (chmod +x)
- [ ] Existing hooks backed up to .git/hooks/pre-commit.bak
- [ ] `--uninstall` removes hooks and restores backups
- [ ] Non-git directory gives helpful error
- [ ] Tests verify hook installation/removal

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.3-git-integration
- **Notes**: (any additional context)

---

**Subtask 3.3.2: Pre-commit Hook Script (2-3 hours)**

**Prerequisites**:
- [x] 3.3.1: Git Hook Installation

**Deliverables**:
- [ ] Create `codemap/hooks/pre_commit.py` module
- [ ] Implement `run_pre_commit_check() -> int` function
- [ ] Detect changed Python files from git staging
- [ ] Run incremental analysis on changed files only
- [ ] Update CODE_MAP.json if changes detected
- [ ] Check for drift if DEVELOPMENT_PLAN.md exists
- [ ] Return 0 to allow commit, 1 to block with message
- [ ] Write test `tests/hooks/test_pre_commit.py`

**Technology Decisions**:
- Incremental analysis for speed
- Only block commit on critical drift (configurable)
- Support `CODEMAP_SKIP=1` env var to bypass

**Files to Create**:
- `codemap/hooks/__init__.py`
- `codemap/hooks/pre_commit.py`
- `tests/hooks/__init__.py`
- `tests/hooks/test_pre_commit.py`

**Files to Modify**:
- None

**Success Criteria**:
- [ ] `run_pre_commit_check()` analyzes staged files
- [ ] Only Python files are analyzed
- [ ] CODE_MAP.json updated with changes
- [ ] Drift warning printed but doesn't block by default
- [ ] `CODEMAP_SKIP=1` bypasses all checks
- [ ] Fast execution (< 5s for typical commits)
- [ ] Tests verify incremental behavior

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/3.3-git-integration
- **Notes**: (any additional context)

---

## Phase 4: Integration & Polish

**Goal**: End-to-end testing, performance, documentation
**Duration**: 2-3 days

### Task 4.1: Testing & Performance

**Git**: Create branch `feature/4.1-testing-performance` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 4.1.1: End-to-End Integration Tests (3-4 hours)**

**Prerequisites**:
- [x] 3.3.2: Pre-commit Hook Script

**Deliverables**:
- [ ] Create `tests/integration/` directory
- [ ] Create `tests/integration/test_full_workflow.py`
- [ ] Test complete workflow: analyze -> sync -> impact -> drift
- [ ] Use real sample project in `tests/fixtures/sample_project/`
- [ ] Create sample project with known dependencies
- [ ] Verify all output files generated correctly
- [ ] Test CLI exit codes
- [ ] Achieve 80%+ test coverage

**Technology Decisions**:
- Use pytest fixtures for setup/teardown
- Sample project: 5-10 files, clear dependencies
- Test both happy path and error cases

**Files to Create**:
- `tests/integration/__init__.py`
- `tests/integration/test_full_workflow.py`
- `tests/fixtures/sample_project/` (multiple files)

**Files to Modify**:
- None

**Success Criteria**:
- [ ] Full workflow test passes end-to-end
- [ ] Sample project has documented expected outputs
- [ ] CODE_MAP.json matches expected content
- [ ] Mermaid diagrams valid
- [ ] DRIFT_REPORT.md generated when drift present
- [ ] Test coverage >= 80%
- [ ] All tests pass in CI

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/4.1-testing-performance
- **Notes**: (any additional context)

---

**Subtask 4.1.2: Performance Benchmarks (2-3 hours)**

**Prerequisites**:
- [x] 4.1.1: End-to-End Integration Tests

**Deliverables**:
- [ ] Create `tests/benchmarks/` directory
- [ ] Create `tests/benchmarks/test_performance.py`
- [ ] Generate synthetic codebase with configurable size
- [ ] Benchmark analyze command at 1k, 10k, 50k LOC
- [ ] Verify < 30s execution for 50k LOC target
- [ ] Profile and identify bottlenecks if over target
- [ ] Document performance characteristics in README
- [ ] Add `--benchmark` pytest marker

**Technology Decisions**:
- Use pytest-benchmark for timing
- Synthetic code generator for reproducible tests
- Skip benchmarks in normal CI (too slow)

**Files to Create**:
- `tests/benchmarks/__init__.py`
- `tests/benchmarks/test_performance.py`
- `tests/benchmarks/codegen.py` (synthetic code generator)

**Files to Modify**:
- `README.md`
- `pyproject.toml` (add pytest markers)

**Success Criteria**:
- [ ] Benchmark for 1k LOC completes in < 2s
- [ ] Benchmark for 10k LOC completes in < 10s
- [ ] Benchmark for 50k LOC completes in < 30s
- [ ] Profile data available for bottleneck analysis
- [ ] README documents performance expectations
- [ ] Benchmarks excluded from normal test run

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/4.1-testing-performance
- **Notes**: (any additional context)

---

### Task 4.2: Documentation

**Git**: Create branch `feature/4.2-documentation` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 4.2.1: README Documentation (2-3 hours)**

**Prerequisites**:
- [x] 4.1.2: Performance Benchmarks

**Deliverables**:
- [ ] Complete README.md with all sections
- [ ] Installation section: pip install, dev setup
- [ ] Quick Start section: basic usage example
- [ ] Commands section: all CLI commands with examples
- [ ] Configuration section: .codemap.toml options
- [ ] Integration section: DevPlanBuilder workflow
- [ ] Add architecture diagram (Mermaid)
- [ ] Add badges: CI, coverage, PyPI version

**Technology Decisions**:
- Use Mermaid for diagrams (GitHub renders natively)
- Include copy-paste examples
- Link to detailed docs for each command

**Files to Create**:
- None (update existing)

**Files to Modify**:
- `README.md`

**Success Criteria**:
- [ ] README has all major sections complete
- [ ] Installation instructions work on clean system
- [ ] Quick start example is copy-pasteable
- [ ] All CLI commands documented with options
- [ ] Configuration options listed with defaults
- [ ] Architecture diagram renders on GitHub
- [ ] Badges display correctly

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (documentation)
- **Build**: N/A (documentation)
- **Branch**: feature/4.2-documentation
- **Notes**: (any additional context)

---

**Subtask 4.2.2: CLI Help Text (2-3 hours)**

**Prerequisites**:
- [x] 4.2.1: README Documentation

**Deliverables**:
- [ ] Review and improve all Click command help strings
- [ ] Add examples to command docstrings (shown in --help)
- [ ] Ensure consistent style across all commands
- [ ] Add epilog text with links to documentation
- [ ] Verify `codemap --help` is comprehensive
- [ ] Verify each subcommand `--help` is clear
- [ ] Add shell completion instructions

**Technology Decisions**:
- Use Click's epilog for additional help text
- Include usage examples in docstrings
- Document environment variables

**Files to Create**:
- None

**Files to Modify**:
- `codemap/cli.py`

**Success Criteria**:
- [ ] `codemap --help` shows all commands with descriptions
- [ ] Each command `--help` has clear description
- [ ] Options have help text explaining purpose
- [ ] Examples shown where helpful
- [ ] Environment variables documented
- [ ] No typos or unclear language
- [ ] Consistent formatting across commands

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (documentation)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/4.2-documentation
- **Notes**: (any additional context)

---

**Subtask 4.2.3: Example Project (2-3 hours)**

**Prerequisites**:
- [x] 4.2.2: CLI Help Text

**Deliverables**:
- [ ] Create `examples/demo_project/` directory
- [ ] Add sample Python application (Flask or FastAPI mini-app)
- [ ] Add sample DEVELOPMENT_PLAN.md for demo project
- [ ] Add sample .codemap.toml configuration
- [ ] Add pre-generated outputs: CODE_MAP.json, diagrams
- [ ] Create `examples/README.md` with walkthrough
- [ ] Add script `examples/run_demo.sh` to regenerate outputs

**Technology Decisions**:
- Use simple web app for relatable example
- Include intentional drift for demonstration
- Script allows users to verify outputs match

**Files to Create**:
- `examples/demo_project/` (multiple files)
- `examples/README.md`
- `examples/run_demo.sh`

**Files to Modify**:
- Main `README.md` (link to examples)

**Success Criteria**:
- [ ] Demo project is self-contained
- [ ] README walkthrough is clear
- [ ] `run_demo.sh` regenerates all outputs
- [ ] Generated outputs match committed outputs
- [ ] Drift intentionally present for demonstration
- [ ] Main README links to examples
- [ ] Example can run without modification

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (example)
- **Build**: N/A (example)
- **Branch**: feature/4.2-documentation
- **Notes**: (any additional context)

---

## Phase 5: Cloud Deployment (AWS Free Tier)

**Goal**: Deploy CodeMap as a web-accessible service on AWS Free Tier
**Duration**: 2-3 days
**Prerequisites**: Phase 4 complete (working CLI tool)

### Task 5.1: Web API Layer

**Git**: Create branch `feature/5.1-web-api` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 5.1.1: FastAPI Application (3-4 hours)**

**Prerequisites**:
- [x] 4.2.3: Example Project

**Deliverables**:
- [ ] Add `fastapi` and `uvicorn` to pyproject.toml dependencies
- [ ] Create `codemap/api/__init__.py`
- [ ] Create `codemap/api/main.py` with FastAPI app
- [ ] Implement `GET /health` endpoint returning `{"status": "healthy"}`
- [ ] Implement `POST /analyze` endpoint accepting `{"repo_url": "...", "branch": "main"}`
- [ ] Implement `GET /results/{job_id}` endpoint for async result retrieval
- [ ] Implement `GET /results/{job_id}/graph` returning Mermaid diagram
- [ ] Add request validation with Pydantic models
- [ ] Write test `tests/api/test_main.py`

**Technology Decisions**:
- FastAPI for async support and automatic OpenAPI docs
- Pydantic for request/response validation
- Background tasks for long-running analysis

**Files to Create**:
- `codemap/api/__init__.py`
- `codemap/api/main.py`
- `codemap/api/models.py`
- `codemap/api/routes.py`
- `tests/api/__init__.py`
- `tests/api/test_main.py`

**Files to Modify**:
- `pyproject.toml`

**Success Criteria**:
- [ ] `uvicorn codemap.api.main:app` starts server on port 8000
- [ ] `GET /health` returns 200 with JSON body
- [ ] `GET /docs` shows Swagger UI
- [ ] `POST /analyze` accepts repo URL and returns job_id
- [ ] Request validation rejects invalid URLs
- [ ] `pytest tests/api/ -v` passes
- [ ] Type hints pass mypy

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/5.1-web-api
- **Notes**: (any additional context)

---

**Subtask 5.1.2: Background Job Processing (2-3 hours)**

**Prerequisites**:
- [x] 5.1.1: FastAPI Application

**Deliverables**:
- [ ] Create `codemap/api/jobs.py` with job management
- [ ] Implement `JobStatus` enum: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
- [ ] Implement `Job` dataclass: id, status, repo_url, created_at, completed_at, result_path, error
- [ ] Implement `JobManager` class with in-memory job storage
- [ ] Implement `create_job(repo_url) -> Job` method
- [ ] Implement `run_job(job_id)` using FastAPI BackgroundTasks
- [ ] Implement `get_job(job_id) -> Job` method
- [ ] Clone repo to temp directory, run analysis, store results
- [ ] Clean up temp directory after analysis
- [ ] Write test `tests/api/test_jobs.py`

**Technology Decisions**:
- In-memory job storage (no Redis/DB for free tier simplicity)
- BackgroundTasks for async processing
- Temp directory cleanup after completion
- Job results stored in `./results/{job_id}/`

**Files to Create**:
- `codemap/api/jobs.py`
- `tests/api/test_jobs.py`

**Files to Modify**:
- `codemap/api/routes.py`

**Success Criteria**:
- [ ] `JobManager` stores and retrieves jobs by ID
- [ ] `create_job()` returns new Job with PENDING status
- [ ] `run_job()` clones repo and runs analysis
- [ ] Job status updates through PENDING -> RUNNING -> COMPLETED/FAILED
- [ ] Failed jobs capture error message
- [ ] Temp directories cleaned up after processing
- [ ] `pytest tests/api/test_jobs.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/5.1-web-api
- **Notes**: (any additional context)

---

**Subtask 5.1.3: Results Storage and Retrieval (2-3 hours)**

**Prerequisites**:
- [x] 5.1.2: Background Job Processing

**Deliverables**:
- [ ] Create `codemap/api/storage.py` with results storage
- [ ] Implement `ResultsStorage` class with local filesystem backend
- [ ] Implement `save_results(job_id, code_map, diagrams)` method
- [ ] Implement `get_code_map(job_id) -> dict` method
- [ ] Implement `get_diagram(job_id, diagram_type) -> str` method
- [ ] Implement `list_jobs() -> List[Job]` method
- [ ] Implement `delete_results(job_id)` method for cleanup
- [ ] Add results directory configuration to `CodeMapConfig`
- [ ] Write test `tests/api/test_storage.py`

**Technology Decisions**:
- Local filesystem storage (S3-compatible interface for future)
- Results stored as JSON and .mermaid files
- Configurable results directory (default: `./results/`)

**Files to Create**:
- `codemap/api/storage.py`
- `tests/api/test_storage.py`

**Files to Modify**:
- `codemap/config.py`
- `codemap/api/jobs.py`

**Success Criteria**:
- [ ] `save_results()` writes CODE_MAP.json and diagrams to disk
- [ ] `get_code_map()` returns parsed JSON
- [ ] `get_diagram()` returns Mermaid string
- [ ] `list_jobs()` returns all stored job metadata
- [ ] `delete_results()` removes job directory
- [ ] Results directory is configurable
- [ ] `pytest tests/api/test_storage.py -v` passes

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/5.1-web-api
- **Notes**: (any additional context)

---

### Task 5.2: AWS Infrastructure

**Git**: Create branch `feature/5.2-aws-infrastructure` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 5.2.1: EC2 Setup Script (2-3 hours)**

**Prerequisites**:
- [x] 5.1.3: Results Storage and Retrieval

**Deliverables**:
- [ ] Create `deploy/` directory for deployment scripts
- [ ] Create `deploy/ec2-setup.sh` for initial EC2 configuration
- [ ] Script installs: Python 3.11, git, pip, virtualenv
- [ ] Script creates codemap user and directory structure
- [ ] Script clones CodeMap repository
- [ ] Script creates virtualenv and installs dependencies
- [ ] Script configures firewall (ufw) to allow ports 22, 80, 443
- [ ] Create `deploy/README.md` with manual EC2 launch instructions
- [ ] Document required EC2 settings: t2.micro, Amazon Linux 2023, 30GB EBS

**Technology Decisions**:
- Amazon Linux 2023 (free tier eligible, well-supported)
- Python 3.11 from amazon-linux-extras or pyenv
- UFW for simple firewall management
- Dedicated codemap user for security

**Files to Create**:
- `deploy/ec2-setup.sh`
- `deploy/README.md`

**Files to Modify**:
- None

**Success Criteria**:
- [ ] Script is executable (`chmod +x`)
- [ ] Script runs without errors on fresh Amazon Linux 2023
- [ ] Python 3.11 installed and accessible
- [ ] CodeMap installed in virtualenv
- [ ] `codemap --version` works after setup
- [ ] Firewall configured correctly
- [ ] README documents all manual AWS console steps

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (deployment script)
- **Build**: N/A (deployment script)
- **Branch**: feature/5.2-aws-infrastructure
- **Notes**: (any additional context)

---

**Subtask 5.2.2: Systemd Service Configuration (2-3 hours)**

**Prerequisites**:
- [x] 5.2.1: EC2 Setup Script

**Deliverables**:
- [ ] Create `deploy/codemap.service` systemd unit file
- [ ] Configure service to run as codemap user
- [ ] Configure service to start uvicorn on port 8000
- [ ] Configure automatic restart on failure
- [ ] Configure environment variables from `/etc/codemap/env`
- [ ] Create `deploy/install-service.sh` to install and enable service
- [ ] Add `ExecStartPre` to check health endpoint
- [ ] Add logging to journald
- [ ] Document service management commands in README

**Technology Decisions**:
- Systemd for process management (standard on Amazon Linux)
- Uvicorn with 2 workers (suitable for t2.micro)
- Environment file for configuration
- Journald for centralized logging

**Systemd Unit File**:
```ini
[Unit]
Description=CodeMap API Service
After=network.target

[Service]
Type=exec
User=codemap
Group=codemap
WorkingDirectory=/opt/codemap
EnvironmentFile=/etc/codemap/env
ExecStart=/opt/codemap/venv/bin/uvicorn codemap.api.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Files to Create**:
- `deploy/codemap.service`
- `deploy/install-service.sh`
- `deploy/codemap.env.example`

**Files to Modify**:
- `deploy/README.md`

**Success Criteria**:
- [ ] Service file passes `systemd-analyze verify`
- [ ] `install-service.sh` copies files and enables service
- [ ] `systemctl start codemap` starts the API
- [ ] `systemctl status codemap` shows active (running)
- [ ] Service auto-restarts after `kill -9`
- [ ] Logs visible via `journalctl -u codemap`
- [ ] README documents all service commands

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (deployment script)
- **Build**: N/A (deployment script)
- **Branch**: feature/5.2-aws-infrastructure
- **Notes**: (any additional context)

---

**Subtask 5.2.3: CloudFront HTTPS Configuration (2-3 hours)**

**Prerequisites**:
- [x] 5.2.2: Systemd Service Configuration

**Deliverables**:
- [ ] Create `deploy/cloudfront-setup.md` with step-by-step instructions
- [ ] Document CloudFront distribution creation via AWS Console
- [ ] Document origin configuration pointing to EC2 Elastic IP
- [ ] Document SSL/TLS certificate setup via ACM
- [ ] Document cache behavior settings (no caching for API)
- [ ] Document custom error responses
- [ ] Create `deploy/cloudfront-policy.json` for cache policy
- [ ] Add health check configuration
- [ ] Document domain setup (optional, with Route 53 alternative)

**Technology Decisions**:
- CloudFront for free HTTPS termination
- ACM for free SSL certificates
- Cache disabled for dynamic API responses
- Origin protocol HTTP (CloudFront -> EC2)

**CloudFront Settings**:
```
Origin Domain: <EC2-Elastic-IP>
Origin Protocol: HTTP only
Viewer Protocol: Redirect HTTP to HTTPS
Cache Policy: CachingDisabled
Origin Request Policy: AllViewer
```

**Files to Create**:
- `deploy/cloudfront-setup.md`
- `deploy/cloudfront-policy.json`

**Files to Modify**:
- `deploy/README.md`

**Success Criteria**:
- [ ] Instructions are complete and reproducible
- [ ] CloudFront distribution creates successfully
- [ ] HTTPS endpoint accessible via `*.cloudfront.net` URL
- [ ] API requests reach EC2 backend
- [ ] `/health` returns 200 via CloudFront
- [ ] `/docs` (Swagger UI) loads correctly
- [ ] No caching issues with POST requests

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (infrastructure documentation)
- **Build**: N/A (infrastructure documentation)
- **Branch**: feature/5.2-aws-infrastructure
- **Notes**: (any additional context)

---

### Task 5.3: Deployment Automation

**Git**: Create branch `feature/5.3-deployment-automation` when starting first subtask. Commit after each subtask. Squash merge to main when task complete.

---

**Subtask 5.3.1: GitHub Actions Deploy Workflow (3-4 hours)**

**Prerequisites**:
- [x] 5.2.3: CloudFront HTTPS Configuration

**Deliverables**:
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Trigger on push to `main` branch (after tests pass)
- [ ] Add job to SSH into EC2 and pull latest code
- [ ] Add job to restart systemd service
- [ ] Add job to verify health endpoint responds
- [ ] Configure GitHub secrets: `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`
- [ ] Add deployment status badge to README
- [ ] Add rollback instructions to deploy/README.md

**Technology Decisions**:
- SSH-based deployment (simple, no additional tooling)
- Health check verification after deploy
- Manual rollback via git revert

**Workflow Steps**:
```yaml
deploy:
  runs-on: ubuntu-latest
  needs: [test, lint, typecheck]
  steps:
    - name: Deploy to EC2
      uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.EC2_HOST }}
        username: ${{ secrets.EC2_USER }}
        key: ${{ secrets.EC2_SSH_KEY }}
        script: |
          cd /opt/codemap
          git pull origin main
          source venv/bin/activate
          pip install -e .
          sudo systemctl restart codemap
    - name: Verify deployment
      run: |
        sleep 10
        curl -f https://${{ secrets.CLOUDFRONT_URL }}/health
```

**Files to Create**:
- `.github/workflows/deploy.yml`

**Files to Modify**:
- `deploy/README.md`
- `README.md` (add deploy badge)

**Success Criteria**:
- [ ] Workflow triggers on push to main
- [ ] Workflow waits for test/lint/typecheck jobs
- [ ] SSH connection to EC2 succeeds
- [ ] Code pulled and service restarted
- [ ] Health check passes after deployment
- [ ] Failed health check fails the workflow
- [ ] Secrets documented in README

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (CI/CD workflow)
- **Build**: N/A (CI/CD workflow)
- **Branch**: feature/5.3-deployment-automation
- **Notes**: (any additional context)

---

**Subtask 5.3.2: S3 Results Backup (2-3 hours)**

**Prerequisites**:
- [x] 5.3.1: GitHub Actions Deploy Workflow

**Deliverables**:
- [ ] Create `codemap/api/storage_s3.py` with S3 backend
- [ ] Implement `S3Storage` class implementing same interface as `ResultsStorage`
- [ ] Implement `upload_results(job_id)` method
- [ ] Implement `download_results(job_id)` method
- [ ] Add `--storage` option to API: `local` or `s3`
- [ ] Add AWS credentials configuration via environment variables
- [ ] Create `deploy/s3-setup.md` with bucket creation instructions
- [ ] Configure bucket lifecycle to delete old results (30 days)
- [ ] Write test `tests/api/test_storage_s3.py` with mocked boto3

**Technology Decisions**:
- boto3 for S3 integration
- Environment variables for credentials (IAM role preferred)
- Same interface as local storage for easy switching
- 30-day lifecycle policy to stay within free tier

**Files to Create**:
- `codemap/api/storage_s3.py`
- `tests/api/test_storage_s3.py`
- `deploy/s3-setup.md`

**Files to Modify**:
- `pyproject.toml` (add boto3)
- `codemap/api/main.py`
- `codemap/config.py`

**Success Criteria**:
- [ ] `S3Storage` implements same interface as `ResultsStorage`
- [ ] Results upload to S3 bucket successfully
- [ ] Results download from S3 successfully
- [ ] `--storage s3` flag switches to S3 backend
- [ ] Missing credentials gives clear error message
- [ ] Lifecycle policy documented in s3-setup.md
- [ ] Tests pass with mocked boto3

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: (X tests, Y% coverage)
- **Build**: (ruff: pass/fail, mypy: pass/fail)
- **Branch**: feature/5.3-deployment-automation
- **Notes**: (any additional context)

---

**Subtask 5.3.3: Production Checklist and Monitoring (2-3 hours)**

**Prerequisites**:
- [x] 5.3.2: S3 Results Backup

**Deliverables**:
- [ ] Create `deploy/PRODUCTION_CHECKLIST.md` with go-live checklist
- [ ] Add security hardening steps: SSH key only, fail2ban, unattended-upgrades
- [ ] Add CloudWatch basic monitoring setup instructions
- [ ] Create `deploy/cloudwatch-alarms.md` for CPU/memory alerts
- [ ] Add log rotation configuration for results directory
- [ ] Add backup script for local results to S3
- [ ] Document cost monitoring and billing alerts
- [ ] Add troubleshooting section for common issues
- [ ] Final verification: all endpoints work via CloudFront HTTPS

**Technology Decisions**:
- CloudWatch free tier: 10 custom metrics, 10 alarms
- Fail2ban for SSH brute-force protection
- Unattended-upgrades for security patches

**Production Checklist Items**:
```markdown
## Security
- [ ] SSH key authentication only (no password)
- [ ] Fail2ban installed and configured
- [ ] Unattended-upgrades enabled
- [ ] Security group allows only 22, 80, 443

## Monitoring
- [ ] CloudWatch agent installed
- [ ] CPU utilization alarm configured (>80%)
- [ ] Disk space alarm configured (>80%)
- [ ] Billing alert set ($5 threshold)

## Verification
- [ ] https://*.cloudfront.net/health returns 200
- [ ] https://*.cloudfront.net/docs loads Swagger UI
- [ ] POST /analyze creates job successfully
- [ ] Results stored and retrievable
```

**Files to Create**:
- `deploy/PRODUCTION_CHECKLIST.md`
- `deploy/cloudwatch-alarms.md`
- `deploy/backup-to-s3.sh`

**Files to Modify**:
- `deploy/README.md`

**Success Criteria**:
- [ ] Checklist covers all security hardening steps
- [ ] CloudWatch setup documented with free tier limits
- [ ] Billing alert instructions included
- [ ] Troubleshooting section covers common issues
- [ ] All endpoints verified via CloudFront
- [ ] README links to all deployment docs
- [ ] Complete deployment possible following docs alone

**Completion Notes**:
- **Implementation**: (describe what was done)
- **Files Created**:
  - (filename) - (line count) lines
- **Files Modified**:
  - (filename)
- **Tests**: N/A (documentation)
- **Build**: N/A (documentation)
- **Branch**: feature/5.3-deployment-automation
- **Notes**: (any additional context)

---

## Git Workflow

### Branch Strategy
- **ONE branch per TASK** (e.g., `feature/1.2-ast-analysis`)
- **NO branches for individual subtasks** - subtasks are commits within the task branch
- Create branch when starting first subtask of a task
- Branch naming: `feature/{phase}.{task}-{description}`

### Commit Strategy
- **One commit per subtask** with semantic message
- Format: `feat(scope): description` or `fix(scope): description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Example: `feat(analyzer): implement pyan3 wrapper for AST analysis`

### Merge Strategy
- **Squash merge when task is complete** (all subtasks done)
- PR required for production branches
- Delete feature branch after merge

### Workflow Example
```bash
# Starting Task 1.2 (first subtask is 1.2.1)
git checkout -b feature/1.2-ast-analysis

# After completing subtask 1.2.1
git add . && git commit -m "feat(analyzer): implement pyan3 integration wrapper"

# After completing subtask 1.2.2
git add . && git commit -m "feat(analyzer): add custom AST visitor"

# After completing subtask 1.2.3 (task complete)
git add . && git commit -m "feat(analyzer): implement symbol registry"
git push -u origin feature/1.2-ast-analysis
# Create PR, squash merge to main, delete branch
```

---

## Ready to Build

You now have a development plan so detailed that even Claude Haiku can implement it. Each subtask is paint-by-numbers: explicit deliverables, specific files, and testable success criteria.

**To start implementation**, use this prompt (change only the subtask ID):

```
Please read CLAUDE.md and DEVELOPMENT_PLAN.md completely, then implement subtask [0.1.1], following all rules and marking checkboxes as you complete each item.
```

**Pro tip**: Start with 0.1.1 and work through subtasks in order. Each one builds on the previous.

---

*Generated with DevPlan methodology*
