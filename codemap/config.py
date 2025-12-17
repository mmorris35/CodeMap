"""Configuration management for CodeMap."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import toml

if TYPE_CHECKING:
    pass


@dataclass
class CodeMapConfig:
    """Configuration for CodeMap analysis."""

    source_dir: Path = field(default_factory=lambda: Path.cwd())
    output_dir: Path = field(default_factory=lambda: Path.cwd() / ".codemap")
    exclude_patterns: list[str] = field(
        default_factory=lambda: ["__pycache__", ".venv", "venv", "site-packages"]
    )
    include_tests: bool = True
    results_dir: Path = field(default_factory=lambda: Path.cwd() / "results")

    def __post_init__(self) -> None:
        """Validate and normalize paths."""
        self.source_dir = self.source_dir.resolve()
        self.output_dir = self.output_dir.resolve()
        self.results_dir = self.results_dir.resolve()


def load_config(config_path: Path | None = None) -> CodeMapConfig:
    """Load CodeMap configuration from file or use defaults.

    Looks for configuration in the following order:
    1. Provided config_path (if given)
    2. .codemap.toml in current directory
    3. pyproject.toml [tool.codemap] section
    4. Default configuration

    Args:
        config_path: Optional path to configuration file.

    Returns:
        CodeMapConfig instance with loaded or default values.
    """
    config_dict: dict[str, object] = {}

    # Try provided config path first
    if config_path and config_path.exists():
        config_dict = toml.load(config_path).get("tool", {}).get("codemap", {})
        return _create_config_from_dict(config_dict)

    # Try .codemap.toml
    codemap_toml = Path.cwd() / ".codemap.toml"
    if codemap_toml.exists():
        config_dict = toml.load(codemap_toml)
        return _create_config_from_dict(config_dict)

    # Try pyproject.toml
    pyproject_toml = Path.cwd() / "pyproject.toml"
    if pyproject_toml.exists():
        data = toml.load(pyproject_toml)
        config_dict = data.get("tool", {}).get("codemap", {})
        if config_dict:
            return _create_config_from_dict(config_dict)

    # Return defaults
    return CodeMapConfig()


def _create_config_from_dict(config_dict: dict[str, object]) -> CodeMapConfig:
    """Create CodeMapConfig from dictionary.

    Args:
        config_dict: Configuration dictionary.

    Returns:
        CodeMapConfig instance.
    """
    # Convert string paths to Path objects
    source_dir = config_dict.get("source_dir")
    if isinstance(source_dir, str):
        config_dict["source_dir"] = Path(source_dir)

    output_dir = config_dict.get("output_dir")
    if isinstance(output_dir, str):
        config_dict["output_dir"] = Path(output_dir)

    results_dir = config_dict.get("results_dir")
    if isinstance(results_dir, str):
        config_dict["results_dir"] = Path(results_dir)

    # Filter to only known fields
    valid_fields = {
        "source_dir",
        "output_dir",
        "exclude_patterns",
        "include_tests",
        "results_dir",
    }
    filtered_dict = {k: v for k, v in config_dict.items() if k in valid_fields}

    # Type cast for mypy
    return CodeMapConfig(
        source_dir=filtered_dict.get("source_dir", Path.cwd()),  # type: ignore
        output_dir=filtered_dict.get("output_dir", Path.cwd() / ".codemap"),  # type: ignore
        exclude_patterns=filtered_dict.get(  # type: ignore
            "exclude_patterns", ["__pycache__", ".venv", "venv", "site-packages"]
        ),
        include_tests=filtered_dict.get("include_tests", True),  # type: ignore
        results_dir=filtered_dict.get("results_dir", Path.cwd() / "results"),  # type: ignore
    )
