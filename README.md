# CodeMap

![CI](https://github.com/your-username/codemap/actions/workflows/ci.yml/badge.svg)

Code impact analyzer and dependency mapper for Python projects

## Description

CodeMap is a CLI tool that analyzes Python codebases to generate dependency graphs and impact maps. It provides insights into code structure, dependency relationships, and the potential impact of changes to specific symbols or modules.

## Installation

Coming soon.

## Usage

Coming soon.

## Development

### Setup

Create and activate virtual environment:
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

Install with development dependencies:
```bash
pip install -e ".[dev]"
```

### Running Tests

```bash
pytest tests/ -v --cov=codemap
```

### Code Quality

```bash
ruff check codemap tests
ruff format --check codemap tests
mypy codemap
```

## License

MIT
