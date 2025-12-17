"""Pydantic models for API request/response validation."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


class JobStatus(str, Enum):
    """Enumeration of possible job statuses."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalyzeRequest(BaseModel):
    """Request model for starting a code analysis job.

    Attributes:
        repo_url: Git repository URL to analyze.
        branch: Git branch to analyze (default: main).
    """

    repo_url: HttpUrl = Field(..., description="Git repository URL")
    branch: str = Field(default="main", description="Git branch to analyze")


class AnalyzeResponse(BaseModel):
    """Response model after starting an analysis job.

    Attributes:
        job_id: Unique identifier for the job.
        status: Current job status.
        created_at: Timestamp when job was created.
    """

    job_id: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Current job status")
    created_at: datetime = Field(..., description="Job creation timestamp")


class JobResponse(BaseModel):
    """Response model for job status and results.

    Attributes:
        job_id: Unique identifier for the job.
        status: Current job status.
        repo_url: Repository URL that was analyzed.
        created_at: Timestamp when job was created.
        completed_at: Timestamp when job completed (if finished).
        error: Error message if job failed.
    """

    job_id: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Current job status")
    repo_url: str = Field(..., description="Repository URL analyzed")
    created_at: datetime = Field(..., description="Job creation timestamp")
    completed_at: Optional[datetime] = Field(default=None, description="Job completion timestamp")
    error: Optional[str] = Field(default=None, description="Error message if failed")


class MermaidDiagramResponse(BaseModel):
    """Response model for Mermaid diagram retrieval.

    Attributes:
        diagram_type: Type of diagram (e.g., 'module', 'function', 'impact').
        content: Mermaid diagram syntax.
        job_id: Associated job identifier.
    """

    diagram_type: str = Field(..., description="Type of diagram")
    content: str = Field(..., description="Mermaid diagram syntax")
    job_id: str = Field(..., description="Associated job identifier")


class CodeMapResponse(BaseModel):
    """Response model for CODE_MAP.json retrieval.

    Attributes:
        job_id: Associated job identifier.
        version: CodeMap format version.
        files: Dictionary of analyzed files and their contents.
    """

    job_id: str = Field(..., description="Associated job identifier")
    version: str = Field(..., description="CodeMap format version")
    files: dict[str, object] = Field(..., description="Analyzed files and contents")
