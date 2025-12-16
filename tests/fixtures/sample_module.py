"""Sample module for testing AST analysis."""

from __future__ import annotations


def helper_function(value: int) -> int:
    """Helper function."""
    return value * 2


class SampleClass:
    """Sample class for testing."""

    def method_one(self, param: str) -> None:
        """First method."""
        result = helper_function(10)
        print(f"Result: {result} with {param}")

    def method_two(self) -> int:
        """Second method."""
        return helper_function(5)
