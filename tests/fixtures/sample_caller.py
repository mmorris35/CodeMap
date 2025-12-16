"""Sample caller module for testing."""

from __future__ import annotations

from tests.fixtures.sample_module import SampleClass, helper_function


def main() -> None:
    """Main function that uses other modules."""
    obj = SampleClass()
    obj.method_one("test")
    result = obj.method_two()
    value = helper_function(result)
    print(f"Final value: {value}")


if __name__ == "__main__":
    main()
