"""Symbol registry for storing and querying code symbols."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from fnmatch import fnmatch
from pathlib import Path
from typing import Optional

from codemap.logging_config import get_logger

logger = get_logger(__name__)


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
        """Initialize empty registry."""
        self._by_name: dict[str, Symbol] = {}
        self._by_location: dict[tuple[Path, int], Symbol] = {}

    def add(self, symbol: Symbol) -> None:
        """Add a symbol to the registry.

        Args:
            symbol: Symbol to add.
        """
        self._by_name[symbol.qualified_name] = symbol
        self._by_location[(symbol.location.file, symbol.location.line)] = symbol
        logger.debug("Added symbol: %s", symbol.qualified_name)

    def get(self, qualified_name: str) -> Optional[Symbol]:
        """Get a symbol by its qualified name.

        Args:
            qualified_name: Fully qualified symbol name.

        Returns:
            Symbol if found, None otherwise.
        """
        return self._by_name.get(qualified_name)

    def search(self, pattern: str) -> list[Symbol]:
        """Search for symbols matching a glob pattern.

        Args:
            pattern: Glob pattern (e.g., 'auth.*', '*.validate*').

        Returns:
            List of matching symbols.
        """
        matching = []
        for qname, symbol in self._by_name.items():
            if fnmatch(qname, pattern):
                matching.append(symbol)
        return matching

    def get_by_location(self, file: Path, line: int) -> Optional[Symbol]:
        """Get a symbol at a specific source location.

        Args:
            file: File path.
            line: Line number.

        Returns:
            Symbol if found at location, None otherwise.
        """
        return self._by_location.get((file, line))

    def get_all(self) -> list[Symbol]:
        """Get all symbols in the registry.

        Returns:
            List of all symbols.
        """
        return list(self._by_name.values())

    def __len__(self) -> int:
        """Get number of symbols in registry."""
        return len(self._by_name)

    def __contains__(self, qualified_name: str) -> bool:
        """Check if symbol exists in registry."""
        return qualified_name in self._by_name
