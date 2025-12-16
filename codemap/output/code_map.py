"""CODE_MAP.json generator for dependency analysis results."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from codemap.logging_config import get_logger
from codemap.output.schemas import CodeMapSchema, validate_code_map

if TYPE_CHECKING:
    from codemap.analyzer.graph import DependencyGraph
    from codemap.analyzer.symbols import SymbolRegistry

logger = get_logger(__name__)


class CodeMapGenerator:
    """Generates CODE_MAP.json output from analysis results."""

    def __init__(self) -> None:
        """Initialize the CODE_MAP generator."""
        pass

    def generate(
        self,
        graph: DependencyGraph,
        registry: SymbolRegistry,
        source_root: str = ".",
    ) -> CodeMapSchema:
        """Generate CODE_MAP.json data structure.

        Creates a complete code map including all symbols and dependencies.

        Args:
            graph: The dependency graph to serialize.
            registry: The symbol registry to include.
            source_root: Root directory of the analyzed source code.

        Returns:
            CodeMapSchema dictionary ready for JSON serialization.
        """
        logger.debug("Generating CODE_MAP")

        # Generate timestamp in ISO 8601 format
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

        # Convert symbols
        symbols_data: list[dict[str, Any]] = []
        for symbol in registry.get_all():
            symbol_entry: dict[str, Any] = {
                "qualified_name": symbol.qualified_name,
                "kind": symbol.kind.value,
                "file": str(symbol.location.file),
                "line": symbol.location.line,
            }

            # Add optional fields
            if symbol.location.column > 0:
                symbol_entry["column"] = symbol.location.column
            if symbol.docstring:
                symbol_entry["docstring"] = symbol.docstring
            if symbol.signature:
                symbol_entry["signature"] = symbol.signature

            symbols_data.append(symbol_entry)

        # Sort symbols for deterministic output
        symbols_data.sort(key=lambda x: x["qualified_name"])

        # Convert dependencies
        dependencies_data: list[dict[str, Any]] = []
        for from_sym, to_sym in graph.get_edges():
            # Get edge attributes
            edge_attrs = graph._graph.get_edge_data(from_sym, to_sym)
            if not edge_attrs:
                continue

            dep_entry: dict[str, Any] = {
                "from_sym": from_sym,
                "to_sym": to_sym,
                "kind": edge_attrs.get("kind", "calls"),
            }

            # Add locations if available
            locations = edge_attrs.get("locations", [])
            if locations:
                locations_data = [
                    {"file": loc, "line": 0}
                    if isinstance(loc, str)
                    else {"file": loc.get("file", ""), "line": loc.get("line", 0)}
                    for loc in locations
                ]
                dep_entry["locations"] = locations_data

            dependencies_data.append(dep_entry)

        # Sort dependencies for deterministic output
        dependencies_data.sort(key=lambda x: (x["from_sym"], x["to_sym"]))

        # Assemble final code map
        code_map: dict[str, Any] = {
            "schema": "http://json-schema.org/draft-07/schema#",
            "version": "1.0",
            "generated_at": timestamp,
            "source_root": source_root,
            "symbols": symbols_data,
            "dependencies": dependencies_data,
        }

        logger.info(
            "Generated CODE_MAP with %d symbols and %d dependencies",
            len(symbols_data),
            len(dependencies_data),
        )

        return code_map  # type: ignore[return-value]

    def save(self, data: CodeMapSchema, path: Path) -> None:
        """Save CODE_MAP.json to file with validation.

        Args:
            data: CodeMapSchema to write.
            path: Path where to save the file.

        Raises:
            ValueError: If data fails schema validation.
            IOError: If file cannot be written.
        """
        logger.debug("Saving CODE_MAP to %s", path)

        # Validate schema
        is_valid, error_msg = validate_code_map(data)
        if not is_valid:
            raise ValueError(f"Code map validation failed: {error_msg}")

        # Create parent directory if needed
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write to file with pretty-printed JSON
        with open(path, "w", encoding="utf-8") as file:
            json.dump(
                data,
                file,
                indent=2,
                sort_keys=True,
                ensure_ascii=False,
            )

        logger.info("Saved CODE_MAP to %s", path)

    def load(self, path: Path) -> CodeMapSchema:
        """Load and validate CODE_MAP.json from file.

        Args:
            path: Path to CODE_MAP.json file.

        Returns:
            Validated CodeMapSchema dictionary.

        Raises:
            FileNotFoundError: If file does not exist.
            json.JSONDecodeError: If file is not valid JSON.
            ValueError: If data fails schema validation.
        """
        logger.debug("Loading CODE_MAP from %s", path)

        if not path.exists():
            raise FileNotFoundError(f"CODE_MAP file not found: {path}")

        # Read and parse JSON
        with open(path, "r", encoding="utf-8") as file:
            data: Any = json.load(file)

        # Validate schema
        is_valid, error_msg = validate_code_map(data)
        if not is_valid:
            raise ValueError(f"Code map validation failed: {error_msg}")

        logger.info("Loaded CODE_MAP from %s", path)
        return data  # type: ignore[no-any-return]
