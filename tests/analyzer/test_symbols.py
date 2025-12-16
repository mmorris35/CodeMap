"""Tests for symbol registry."""

from __future__ import annotations

from pathlib import Path

from codemap.analyzer.symbols import (
    SourceLocation,
    Symbol,
    SymbolKind,
    SymbolRegistry,
)


def test_symbol_creation() -> None:
    """Test creating a symbol."""
    loc = SourceLocation(file=Path("test.py"), line=10)
    symbol = Symbol(
        name="test_func",
        qualified_name="module.test_func",
        kind=SymbolKind.FUNCTION,
        location=loc,
    )
    assert symbol.name == "test_func"
    assert symbol.qualified_name == "module.test_func"


def test_symbol_immutability() -> None:
    """Test that symbols are immutable."""
    import pytest

    loc = SourceLocation(file=Path("test.py"), line=10)
    symbol = Symbol(
        name="func",
        qualified_name="mod.func",
        kind=SymbolKind.FUNCTION,
        location=loc,
    )
    # Symbol is frozen, so modifying should raise an error
    with pytest.raises(Exception):
        symbol.name = "changed"  # type: ignore


def test_registry_add_and_get() -> None:
    """Test adding and retrieving symbols."""
    registry = SymbolRegistry()
    loc = SourceLocation(file=Path("test.py"), line=10)
    symbol = Symbol(
        name="func",
        qualified_name="mod.func",
        kind=SymbolKind.FUNCTION,
        location=loc,
    )
    registry.add(symbol)
    retrieved = registry.get("mod.func")
    assert retrieved == symbol


def test_registry_get_missing() -> None:
    """Test getting non-existent symbol."""
    registry = SymbolRegistry()
    assert registry.get("missing") is None


def test_registry_search() -> None:
    """Test searching with glob patterns."""
    registry = SymbolRegistry()
    symbols = [
        Symbol(
            name="validate",
            qualified_name="auth.validate_user",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=10),
        ),
        Symbol(
            name="validate",
            qualified_name="auth.validate_token",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=20),
        ),
        Symbol(
            name="login",
            qualified_name="api.routes.login",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("api.py"), line=30),
        ),
    ]
    for sym in symbols:
        registry.add(sym)

    # Search with glob
    matches = registry.search("auth.*")
    assert len(matches) == 2

    matches = registry.search("auth.validate*")
    assert len(matches) == 2

    matches = registry.search("*.login")
    assert len(matches) == 1


def test_registry_by_location() -> None:
    """Test looking up symbol by location."""
    registry = SymbolRegistry()
    loc = SourceLocation(file=Path("test.py"), line=10)
    symbol = Symbol(
        name="func",
        qualified_name="mod.func",
        kind=SymbolKind.FUNCTION,
        location=loc,
    )
    registry.add(symbol)
    retrieved = registry.get_by_location(Path("test.py"), 10)
    assert retrieved == symbol


def test_registry_contains() -> None:
    """Test checking if symbol exists."""
    registry = SymbolRegistry()
    loc = SourceLocation(file=Path("test.py"), line=10)
    symbol = Symbol(
        name="func",
        qualified_name="mod.func",
        kind=SymbolKind.FUNCTION,
        location=loc,
    )
    registry.add(symbol)
    assert "mod.func" in registry
    assert "missing.func" not in registry


def test_registry_length() -> None:
    """Test getting registry size."""
    registry = SymbolRegistry()
    assert len(registry) == 0

    loc = SourceLocation(file=Path("test.py"), line=10)
    symbol = Symbol(
        name="func",
        qualified_name="mod.func",
        kind=SymbolKind.FUNCTION,
        location=loc,
    )
    registry.add(symbol)
    assert len(registry) == 1
