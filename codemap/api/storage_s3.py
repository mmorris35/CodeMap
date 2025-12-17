"""S3-backed results storage for CodeMap analysis jobs."""

from __future__ import annotations

import json
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from codemap.logging_config import get_logger

logger = get_logger(__name__)


class S3Storage:
    """Manages cloud storage of analysis job results using AWS S3.

    Provides an S3 backend for storing job results including CODE_MAP.json
    and Mermaid diagrams. Implements the same interface as ResultsStorage
    for easy switching between local and cloud storage.

    Attributes:
        _bucket_name: Name of the S3 bucket for storing results.
        _client: Boto3 S3 client instance.
        _prefix: Optional prefix for all S3 keys (e.g., "codemap/").
    """

    def __init__(
        self,
        bucket_name: str,
        prefix: str = "",
        region: str = "us-west-2",
    ) -> None:
        """Initialize the S3 storage backend.

        Args:
            bucket_name: Name of the S3 bucket for storing results.
            prefix: Optional prefix for all S3 keys. Defaults to "".
            region: AWS region for S3 bucket. Defaults to "us-west-2".

        Raises:
            ValueError: If bucket_name is empty.
            ClientError: If unable to connect to S3 or bucket doesn't exist.
        """
        if not bucket_name:
            raise ValueError("bucket_name cannot be empty")

        self._bucket_name = bucket_name
        self._prefix = prefix.rstrip("/")
        self._client = boto3.client("s3", region_name=region)

        logger.debug(
            "S3Storage initialized: bucket=%s, prefix=%s, region=%s",
            bucket_name,
            prefix,
            region,
        )

        # Verify bucket exists and is accessible
        try:
            self._client.head_bucket(Bucket=bucket_name)
            logger.info("S3 bucket %s is accessible", bucket_name)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "Unknown")
            logger.error("Failed to access S3 bucket %s: %s", bucket_name, error_code)
            raise ValueError(f"S3 bucket {bucket_name} is not accessible: {error_code}")

    def _get_key(self, job_id: str, file_name: str) -> str:
        """Get the S3 key for a file.

        Args:
            job_id: Unique job identifier.
            file_name: File name (e.g., "CODE_MAP.json", "module.mermaid").

        Returns:
            Full S3 key path.
        """
        if self._prefix:
            return f"{self._prefix}/{job_id}/{file_name}"
        return f"{job_id}/{file_name}"

    def save_results(
        self,
        job_id: str,
        code_map: dict[str, object],
        diagrams: dict[str, str],
    ) -> None:
        """Save analysis results to S3.

        Uploads CODE_MAP.json and Mermaid diagram files to the configured
        S3 bucket under the job ID prefix.

        Args:
            job_id: Unique job identifier.
            code_map: CODE_MAP.json content as dictionary.
            diagrams: Dictionary of diagram_type -> diagram_content.
                      Common types: 'module', 'function', 'impact'.

        Raises:
            ClientError: If unable to upload to S3.

        Example:
            >>> storage.save_results(
            ...     job_id="abc12345",
            ...     code_map={"version": "1.0", "files": {}},
            ...     diagrams={"module": "graph TD..."},
            ... )
        """
        try:
            # Upload CODE_MAP.json
            code_map_key = self._get_key(job_id, "CODE_MAP.json")
            code_map_data = json.dumps(code_map, indent=2).encode("utf-8")
            self._client.put_object(
                Bucket=self._bucket_name,
                Key=code_map_key,
                Body=code_map_data,
                ContentType="application/json",
            )
            logger.debug("Uploaded CODE_MAP.json to %s", code_map_key)

            # Upload diagrams
            for diagram_type, diagram_content in diagrams.items():
                diagram_key = self._get_key(job_id, f"{diagram_type}.mermaid")
                diagram_data = diagram_content.encode("utf-8")
                self._client.put_object(
                    Bucket=self._bucket_name,
                    Key=diagram_key,
                    Body=diagram_data,
                    ContentType="text/plain",
                )
                logger.debug("Uploaded %s diagram to %s", diagram_type, diagram_key)

            logger.info("Successfully saved results for job %s to S3", job_id)

        except ClientError as exc:
            logger.error(
                "Failed to save results for job %s to S3: %s",
                job_id,
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise

    def get_code_map(self, job_id: str) -> dict[str, object]:
        """Retrieve CODE_MAP.json for a job from S3.

        Args:
            job_id: Unique job identifier.

        Returns:
            Parsed CODE_MAP.json as dictionary.

        Raises:
            ClientError: If file not found or unable to download.
            json.JSONDecodeError: If file content is not valid JSON.
        """
        code_map_key = self._get_key(job_id, "CODE_MAP.json")

        try:
            response = self._client.get_object(
                Bucket=self._bucket_name,
                Key=code_map_key,
            )
            content = response["Body"].read().decode("utf-8")
            logger.debug("Retrieved CODE_MAP.json for job %s", job_id)
            return json.loads(content)

        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "NoSuchKey":
                logger.warning("CODE_MAP.json not found for job %s", job_id)
                raise FileNotFoundError(f"CODE_MAP.json not found for job {job_id}")
            logger.error(
                "Failed to retrieve CODE_MAP.json for job %s: %s",
                job_id,
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise

    def get_diagram(self, job_id: str, diagram_type: str) -> str:
        """Retrieve a Mermaid diagram for a job from S3.

        Args:
            job_id: Unique job identifier.
            diagram_type: Type of diagram ('module', 'function', 'impact', etc.).

        Returns:
            Mermaid diagram content as string.

        Raises:
            ClientError: If file not found or unable to download.
        """
        diagram_key = self._get_key(job_id, f"{diagram_type}.mermaid")

        try:
            response = self._client.get_object(
                Bucket=self._bucket_name,
                Key=diagram_key,
            )
            content = response["Body"].read().decode("utf-8")
            logger.debug("Retrieved %s diagram for job %s", diagram_type, job_id)
            return content

        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "NoSuchKey":
                logger.warning("%s diagram not found for job %s", diagram_type, job_id)
                raise FileNotFoundError(f"{diagram_type} diagram not found for job {job_id}")
            logger.error(
                "Failed to retrieve %s diagram for job %s: %s",
                diagram_type,
                job_id,
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise

    def list_jobs(self) -> list[str]:
        """List all job IDs with results in S3.

        Retrieves all unique job IDs by listing objects under the prefix
        and extracting job ID from each key path.

        Returns:
            List of unique job IDs with stored results.

        Raises:
            ClientError: If unable to list bucket contents.
        """
        job_ids: set[str] = set()
        prefix = self._prefix + "/" if self._prefix else ""

        try:
            paginator = self._client.get_paginator("list_objects_v2")
            page_iterator = paginator.paginate(
                Bucket=self._bucket_name,
                Prefix=prefix,
            )

            for page in page_iterator:
                if "Contents" not in page:
                    continue

                for obj in page["Contents"]:
                    key = obj["Key"]
                    # Extract job_id from key (e.g., "prefix/job_id/file" -> "job_id")
                    parts = key[len(prefix) :].split("/")
                    if len(parts) >= 2:
                        job_id = parts[0]
                        job_ids.add(job_id)

            logger.debug("Found %d jobs in S3", len(job_ids))
            return sorted(list(job_ids))

        except ClientError as exc:
            logger.error(
                "Failed to list jobs in S3: %s",
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise

    def delete_results(self, job_id: str) -> None:
        """Delete all results for a job from S3.

        Removes all objects associated with the job ID, including
        CODE_MAP.json and all diagram files.

        Args:
            job_id: Unique job identifier.

        Raises:
            ClientError: If unable to delete objects.
        """
        prefix = self._prefix + "/" if self._prefix else ""
        job_prefix = f"{prefix}{job_id}/"

        try:
            paginator = self._client.get_paginator("list_objects_v2")
            page_iterator = paginator.paginate(
                Bucket=self._bucket_name,
                Prefix=job_prefix,
            )

            for page in page_iterator:
                if "Contents" not in page:
                    continue

                objects_to_delete = [{"Key": obj["Key"]} for obj in page["Contents"]]
                if objects_to_delete:
                    self._client.delete_objects(
                        Bucket=self._bucket_name,
                        Delete={"Objects": objects_to_delete},
                    )

            logger.info("Deleted results for job %s from S3", job_id)

        except ClientError as exc:
            logger.error(
                "Failed to delete results for job %s: %s",
                job_id,
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise

    def download_results(self, job_id: str, local_dir: Path) -> None:
        """Download all results for a job from S3 to local filesystem.

        Creates the target directory if it doesn't exist and downloads
        all job files from S3.

        Args:
            job_id: Unique job identifier.
            local_dir: Local directory to download results to.

        Raises:
            ClientError: If unable to download from S3.
        """
        local_dir.mkdir(parents=True, exist_ok=True)
        prefix = self._prefix + "/" if self._prefix else ""
        job_prefix = f"{prefix}{job_id}/"

        try:
            paginator = self._client.get_paginator("list_objects_v2")
            page_iterator = paginator.paginate(
                Bucket=self._bucket_name,
                Prefix=job_prefix,
            )

            file_count = 0
            for page in page_iterator:
                if "Contents" not in page:
                    continue

                for obj in page["Contents"]:
                    s3_key = obj["Key"]
                    # Extract file name from key
                    file_name = s3_key.split("/")[-1]
                    local_file = local_dir / file_name

                    response = self._client.get_object(
                        Bucket=self._bucket_name,
                        Key=s3_key,
                    )
                    local_file.write_bytes(response["Body"].read())
                    file_count += 1
                    logger.debug("Downloaded %s to %s", s3_key, local_file)

            logger.info("Downloaded %d files for job %s to %s", file_count, job_id, local_dir)

        except ClientError as exc:
            logger.error(
                "Failed to download results for job %s: %s",
                job_id,
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise

    def upload_results(self, job_id: str, local_dir: Path) -> None:
        """Upload results from local filesystem to S3.

        Uploads all files from the local job directory to S3.

        Args:
            job_id: Unique job identifier.
            local_dir: Local directory containing job results.

        Raises:
            ClientError: If unable to upload to S3.
            FileNotFoundError: If local directory doesn't exist.
        """
        if not local_dir.exists():
            raise FileNotFoundError(f"Local directory does not exist: {local_dir}")

        try:
            file_count = 0
            for file_path in local_dir.iterdir():
                if file_path.is_file():
                    s3_key = self._get_key(job_id, file_path.name)
                    self._client.upload_file(
                        str(file_path),
                        self._bucket_name,
                        s3_key,
                    )
                    file_count += 1
                    logger.debug("Uploaded %s to %s", file_path.name, s3_key)

            logger.info("Uploaded %d files for job %s to S3", file_count, job_id)

        except ClientError as exc:
            logger.error(
                "Failed to upload results for job %s: %s",
                job_id,
                exc.response.get("Error", {}).get("Message", str(exc)),
            )
            raise
