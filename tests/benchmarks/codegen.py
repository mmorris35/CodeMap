"""Synthetic code generator for performance benchmarks."""

from __future__ import annotations

from pathlib import Path


def generate_synthetic_project(
    output_dir: Path,
    num_modules: int = 10,
    functions_per_module: int = 20,
) -> list[Path]:
    """Generate a synthetic Python project for benchmarking.

    Creates a project structure with multiple modules, each containing
    multiple functions with cross-module dependencies to simulate a
    realistic codebase.

    Args:
        output_dir: Directory to generate project files in.
        num_modules: Number of Python modules to create.
        functions_per_module: Functions to generate per module.

    Returns:
        List of paths to generated Python files.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Create __init__.py
    (output_dir / "__init__.py").write_text('"""Synthetic project."""\n')

    generated_files: list[Path] = []

    # Generate modules with cross-dependencies
    for module_id in range(num_modules):
        module_name = f"module_{module_id:03d}"
        module_file = output_dir / f"{module_name}.py"

        # Build module with imports from other modules
        lines = [
            '"""Synthetic module for benchmarking."""',
            "",
            "from __future__ import annotations",
            "",
        ]

        # Add cross-module imports
        if module_id > 0:
            prev_module = f"module_{module_id - 1:03d}"
            lines.append(f"from {prev_module} import func_000 as prev_func")
            lines.append("")

        # Add functions
        for func_id in range(functions_per_module):
            func_name = f"func_{func_id:03d}"
            lines.append(f"def {func_name}(arg: int) -> int:")
            lines.append(f'    """Function {func_name} in {module_name}."""')

            # Call previous module function if available
            if module_id > 0 and func_id > 0:
                lines.append(f"    prev_func({func_id})")

            # Call other functions in same module
            if func_id > 0:
                lines.append(f"    func_{func_id - 1:03d}(arg - 1)")

            lines.append(f"    return arg + {func_id}")
            lines.append("")

        module_file.write_text("\n".join(lines))
        generated_files.append(module_file)

    return generated_files


def estimate_lines_of_code(
    num_modules: int = 10,
    functions_per_module: int = 20,
) -> int:
    """Estimate LOC for a synthetic project.

    Args:
        num_modules: Number of modules.
        functions_per_module: Functions per module.

    Returns:
        Estimated number of lines of code.
    """
    # Rough estimation:
    # - Module header: ~5 lines
    # - Function header: ~3 lines
    # - Function body: ~5 lines
    # = ~13 lines per function + ~5 module header
    return num_modules * (5 + functions_per_module * 13)
