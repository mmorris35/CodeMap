"""FastAPI application for CodeMap service."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from codemap.api.routes import router, set_job_manager
from codemap.logging_config import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifespan events.

    Args:
        app: FastAPI application instance.

    Yields:
        Control to FastAPI after initialization.
    """
    # Startup
    logger.info("Starting CodeMap API")

    # Import here to avoid circular imports
    from codemap.api.jobs import JobManager
    from codemap.api.storage import ResultsStorage
    from codemap.config import load_config

    # Load configuration and create storage
    config = load_config()
    storage = ResultsStorage(config.results_dir)
    logger.info("ResultsStorage initialized with base_dir: %s", config.results_dir)

    # Create job manager
    job_manager = JobManager(storage)
    set_job_manager(job_manager)

    logger.info("JobManager initialized")

    yield

    # Shutdown
    logger.info("Shutting down CodeMap API")


# Create FastAPI application
app = FastAPI(
    title="CodeMap API",
    description="Code dependency analysis as a service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Include API routes
app.include_router(router)


@app.get(
    "/health",
    summary="Health check endpoint",
    description="Returns API health status.",
)
async def health_check() -> dict[str, str]:
    """Health check endpoint.

    Returns:
        Dictionary with health status.
    """
    return {"status": "healthy"}


@app.get("/")
async def root() -> JSONResponse:
    """Root endpoint.

    Returns:
        Welcome message and link to API documentation.
    """
    return JSONResponse(
        {
            "message": "CodeMap API",
            "docs": "/docs",
            "health": "/health",
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
