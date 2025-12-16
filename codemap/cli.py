"""CodeMap CLI entry point."""

from __future__ import annotations

import click

from codemap import __version__
from codemap.logging_config import get_logger, setup_logging

logger = get_logger(__name__)


@click.group()
@click.version_option(version=__version__)
@click.option(
    "-v",
    "--verbose",
    is_flag=True,
    help="Enable DEBUG level logging.",
)
@click.option(
    "-q",
    "--quiet",
    is_flag=True,
    help="Suppress INFO level logging.",
)
@click.pass_context
def cli(ctx: click.Context, verbose: bool, quiet: bool) -> None:
    """CodeMap - Code impact analyzer and dependency mapper."""
    # Determine log level
    if verbose:
        log_level = "DEBUG"
    elif quiet:
        log_level = "WARNING"
    else:
        log_level = "INFO"

    setup_logging(level=log_level)
    logger.debug("Logging level set to %s", log_level)


if __name__ == "__main__":
    cli()
