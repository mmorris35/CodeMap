"""CodeMap CLI entry point."""

from __future__ import annotations

import click

from codemap import __version__


@click.group()
@click.version_option(version=__version__)
def cli() -> None:
    """CodeMap - Code impact analyzer and dependency mapper."""


if __name__ == "__main__":
    cli()
