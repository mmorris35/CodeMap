"""Tests for S3-backed results storage."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest
from botocore.exceptions import ClientError

from codemap.api.storage_s3 import S3Storage


@pytest.fixture
def mock_s3_client() -> Mock:
    """Create a mock S3 client.

    Returns:
        Mock boto3 S3 client.
    """
    return MagicMock()


@pytest.fixture
def s3_storage(mock_s3_client: Mock) -> S3Storage:
    """Create S3Storage instance with mocked boto3 client.

    Args:
        mock_s3_client: Mocked boto3 client.

    Returns:
        S3Storage instance with mocked client.
    """
    with patch("codemap.api.storage_s3.boto3.client", return_value=mock_s3_client):
        storage = S3Storage(bucket_name="test-bucket")
        return storage


@pytest.fixture
def s3_storage_with_prefix(mock_s3_client: Mock) -> S3Storage:
    """Create S3Storage with prefix.

    Args:
        mock_s3_client: Mocked boto3 client.

    Returns:
        S3Storage instance with prefix.
    """
    with patch("codemap.api.storage_s3.boto3.client", return_value=mock_s3_client):
        storage = S3Storage(
            bucket_name="test-bucket",
            prefix="codemap",
        )
        return storage


@pytest.fixture
def temp_local_dir(tmp_path: Path) -> Path:
    """Create temporary local directory.

    Args:
        tmp_path: pytest tmp_path fixture.

    Returns:
        Path to temporary directory.
    """
    return tmp_path


class TestS3StorageInitialization:
    """Tests for S3Storage initialization."""

    def test_initialization_success(self, mock_s3_client: Mock) -> None:
        """Test successful S3Storage initialization."""
        with patch("codemap.api.storage_s3.boto3.client", return_value=mock_s3_client):
            storage = S3Storage(bucket_name="my-bucket")

            assert storage._bucket_name == "my-bucket"
            assert storage._prefix == ""
            mock_s3_client.head_bucket.assert_called_once_with(Bucket="my-bucket")

    def test_initialization_with_prefix(self, mock_s3_client: Mock) -> None:
        """Test initialization with S3 prefix."""
        with patch("codemap.api.storage_s3.boto3.client", return_value=mock_s3_client):
            storage = S3Storage(
                bucket_name="my-bucket",
                prefix="codemap/",
            )

            assert storage._bucket_name == "my-bucket"
            assert storage._prefix == "codemap"

    def test_initialization_with_region(self, mock_s3_client: Mock) -> None:
        """Test initialization with custom region."""
        with patch(
            "codemap.api.storage_s3.boto3.client", return_value=mock_s3_client
        ) as mock_boto3:
            _ = S3Storage(
                bucket_name="my-bucket",
                region="us-east-1",
            )

            mock_boto3.assert_called_once_with("s3", region_name="us-east-1")

    def test_initialization_empty_bucket_name(self) -> None:
        """Test initialization with empty bucket name raises ValueError."""
        with pytest.raises(ValueError, match="bucket_name cannot be empty"):
            S3Storage(bucket_name="")

    def test_initialization_bucket_not_accessible(self, mock_s3_client: Mock) -> None:
        """Test initialization fails if bucket is not accessible."""
        mock_s3_client.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "NoSuchBucket", "Message": "Bucket not found"}},
            "HeadBucket",
        )

        with patch("codemap.api.storage_s3.boto3.client", return_value=mock_s3_client):
            with pytest.raises(ValueError, match="not accessible"):
                S3Storage(bucket_name="nonexistent-bucket")

    def test_initialization_access_denied(self, mock_s3_client: Mock) -> None:
        """Test initialization fails with access denied."""
        mock_s3_client.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
            "HeadBucket",
        )

        with patch("codemap.api.storage_s3.boto3.client", return_value=mock_s3_client):
            with pytest.raises(ValueError, match="not accessible"):
                S3Storage(bucket_name="protected-bucket")


class TestGetKey:
    """Tests for S3 key generation."""

    def test_get_key_without_prefix(self, s3_storage: S3Storage) -> None:
        """Test S3 key generation without prefix."""
        key = s3_storage._get_key("job123", "CODE_MAP.json")
        assert key == "job123/CODE_MAP.json"

    def test_get_key_with_prefix(self, s3_storage_with_prefix: S3Storage) -> None:
        """Test S3 key generation with prefix."""
        key = s3_storage_with_prefix._get_key("job123", "CODE_MAP.json")
        assert key == "codemap/job123/CODE_MAP.json"

    def test_get_key_different_files(self, s3_storage: S3Storage) -> None:
        """Test S3 key generation for different file types."""
        assert s3_storage._get_key("job1", "CODE_MAP.json") == "job1/CODE_MAP.json"
        assert s3_storage._get_key("job1", "module.mermaid") == "job1/module.mermaid"
        assert s3_storage._get_key("job1", "function.mermaid") == "job1/function.mermaid"


class TestSaveResults:
    """Tests for saving results to S3."""

    def test_save_results_success(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test successful result saving."""
        job_id = "job123"
        code_map: dict[str, object] = {"version": "1.0", "files": {}}
        diagrams: dict[str, str] = {"module": "graph TD"}

        s3_storage.save_results(job_id, code_map, diagrams)

        # Verify CODE_MAP.json was uploaded
        mock_s3_client.put_object.assert_any_call(
            Bucket="test-bucket",
            Key="job123/CODE_MAP.json",
            Body=json.dumps(code_map, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

        # Verify diagram was uploaded
        mock_s3_client.put_object.assert_any_call(
            Bucket="test-bucket",
            Key="job123/module.mermaid",
            Body="graph TD".encode("utf-8"),
            ContentType="text/plain",
        )

    def test_save_results_multiple_diagrams(
        self, s3_storage: S3Storage, mock_s3_client: Mock
    ) -> None:
        """Test saving multiple diagrams."""
        job_id = "job456"
        code_map: dict[str, object] = {"version": "1.0"}
        diagrams: dict[str, str] = {
            "module": "graph TD\n    A --> B",
            "function": "graph TD\n    F1 --> F2",
            "impact": "graph TD\n    I1 --> I2",
        }

        s3_storage.save_results(job_id, code_map, diagrams)

        # Verify all diagrams uploaded
        assert mock_s3_client.put_object.call_count == 4  # CODE_MAP + 3 diagrams

    def test_save_results_s3_error(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test handling of S3 upload errors."""
        mock_s3_client.put_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchBucket", "Message": "Bucket not found"}},
            "PutObject",
        )

        with pytest.raises(ClientError):
            s3_storage.save_results("job123", {}, {})

    def test_save_results_with_prefix(
        self, s3_storage_with_prefix: S3Storage, mock_s3_client: Mock
    ) -> None:
        """Test saving results with prefix."""
        s3_storage_with_prefix.save_results("job123", {"version": "1.0"}, {})

        # Verify key includes prefix
        mock_s3_client.put_object.assert_called()
        call_kwargs = mock_s3_client.put_object.call_args[1]
        assert call_kwargs["Key"].startswith("codemap/job123/")


class TestGetCodeMap:
    """Tests for retrieving CODE_MAP from S3."""

    def test_get_code_map_success(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test successful CODE_MAP retrieval."""
        job_id = "job123"
        expected_data: dict[str, object] = {"version": "1.0", "files": {"main.py": {}}}
        mock_s3_client.get_object.return_value = {
            "Body": MagicMock(read=lambda: json.dumps(expected_data).encode("utf-8"))
        }

        result = s3_storage.get_code_map(job_id)

        assert result == expected_data
        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="job123/CODE_MAP.json",
        )

    def test_get_code_map_not_found(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test CODE_MAP not found error."""
        mock_s3_client.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "Key not found"}},
            "GetObject",
        )

        with pytest.raises(FileNotFoundError):
            s3_storage.get_code_map("nonexistent")

    def test_get_code_map_invalid_json(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test handling of invalid JSON."""
        mock_s3_client.get_object.return_value = {"Body": MagicMock(read=lambda: b"invalid json")}

        with pytest.raises(json.JSONDecodeError):
            s3_storage.get_code_map("job123")

    def test_get_code_map_s3_error(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test handling of other S3 errors."""
        mock_s3_client.get_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
            "GetObject",
        )

        with pytest.raises(ClientError):
            s3_storage.get_code_map("job123")


class TestGetDiagram:
    """Tests for retrieving diagrams from S3."""

    def test_get_diagram_success(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test successful diagram retrieval."""
        job_id = "job123"
        diagram_content = "graph TD\n    A[Main] --> B[Util]"
        mock_s3_client.get_object.return_value = {
            "Body": MagicMock(read=lambda: diagram_content.encode("utf-8"))
        }

        result = s3_storage.get_diagram(job_id, "module")

        assert result == diagram_content
        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="job123/module.mermaid",
        )

    def test_get_diagram_not_found(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test diagram not found error."""
        mock_s3_client.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "Key not found"}},
            "GetObject",
        )

        with pytest.raises(FileNotFoundError, match="module diagram not found"):
            s3_storage.get_diagram("job123", "module")

    def test_get_diagram_different_types(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test retrieving different diagram types."""
        mock_s3_client.get_object.return_value = {"Body": MagicMock(read=lambda: b"graph TD")}

        s3_storage.get_diagram("job123", "module")
        s3_storage.get_diagram("job123", "function")
        s3_storage.get_diagram("job123", "impact")

        calls = mock_s3_client.get_object.call_args_list
        assert calls[0][1]["Key"] == "job123/module.mermaid"
        assert calls[1][1]["Key"] == "job123/function.mermaid"
        assert calls[2][1]["Key"] == "job123/impact.mermaid"


class TestListJobs:
    """Tests for listing job IDs."""

    def test_list_jobs_empty_bucket(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test listing jobs in empty bucket."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{}]
        mock_s3_client.get_paginator.return_value = mock_paginator

        result = s3_storage.list_jobs()

        assert result == []

    def test_list_jobs_with_results(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test listing jobs with results."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "job1/CODE_MAP.json"},
                    {"Key": "job1/module.mermaid"},
                    {"Key": "job2/CODE_MAP.json"},
                    {"Key": "job3/module.mermaid"},
                ]
            }
        ]
        mock_s3_client.get_paginator.return_value = mock_paginator

        result = s3_storage.list_jobs()

        assert set(result) == {"job1", "job2", "job3"}

    def test_list_jobs_with_prefix(
        self, s3_storage_with_prefix: S3Storage, mock_s3_client: Mock
    ) -> None:
        """Test listing jobs with prefix."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "codemap/job1/CODE_MAP.json"},
                    {"Key": "codemap/job2/CODE_MAP.json"},
                ]
            }
        ]
        mock_s3_client.get_paginator.return_value = mock_paginator

        result = s3_storage_with_prefix.list_jobs()

        assert set(result) == {"job1", "job2"}
        mock_s3_client.get_paginator.assert_called_once_with("list_objects_v2")
        call_kwargs = mock_paginator.paginate.call_args[1]
        assert call_kwargs["Prefix"] == "codemap/"

    def test_list_jobs_s3_error(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test handling S3 errors when listing jobs."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
            "ListObjectsV2",
        )
        mock_s3_client.get_paginator.return_value = mock_paginator

        with pytest.raises(ClientError):
            s3_storage.list_jobs()


class TestDeleteResults:
    """Tests for deleting job results."""

    def test_delete_results_success(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test successful result deletion."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "job123/CODE_MAP.json"},
                    {"Key": "job123/module.mermaid"},
                ]
            }
        ]
        mock_s3_client.get_paginator.return_value = mock_paginator

        s3_storage.delete_results("job123")

        mock_s3_client.delete_objects.assert_called_once()
        call_kwargs = mock_s3_client.delete_objects.call_args[1]
        assert call_kwargs["Bucket"] == "test-bucket"
        assert len(call_kwargs["Delete"]["Objects"]) == 2

    def test_delete_results_no_files(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test deleting results when no files exist."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{}]
        mock_s3_client.get_paginator.return_value = mock_paginator

        s3_storage.delete_results("nonexistent")

        # Should not call delete_objects if no files found
        mock_s3_client.delete_objects.assert_not_called()

    def test_delete_results_s3_error(self, s3_storage: S3Storage, mock_s3_client: Mock) -> None:
        """Test handling S3 errors during deletion."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
            "ListObjectsV2",
        )
        mock_s3_client.get_paginator.return_value = mock_paginator

        with pytest.raises(ClientError):
            s3_storage.delete_results("job123")


class TestDownloadResults:
    """Tests for downloading results from S3."""

    def test_download_results_success(
        self, s3_storage: S3Storage, mock_s3_client: Mock, temp_local_dir: Path
    ) -> None:
        """Test successful result download."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "job123/CODE_MAP.json"},
                    {"Key": "job123/module.mermaid"},
                ]
            }
        ]
        mock_s3_client.get_paginator.return_value = mock_paginator
        mock_s3_client.get_object.return_value = {"Body": MagicMock(read=lambda: b"test content")}

        s3_storage.download_results("job123", temp_local_dir)

        assert (temp_local_dir / "CODE_MAP.json").exists()
        assert (temp_local_dir / "module.mermaid").exists()

    def test_download_results_creates_directory(
        self, s3_storage: S3Storage, mock_s3_client: Mock, temp_local_dir: Path
    ) -> None:
        """Test that download creates target directory."""
        nonexistent_dir = temp_local_dir / "nested" / "path"
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [{"Contents": [{"Key": "job123/CODE_MAP.json"}]}]
        mock_s3_client.get_paginator.return_value = mock_paginator
        mock_s3_client.get_object.return_value = {"Body": MagicMock(read=lambda: b"{}")}

        s3_storage.download_results("job123", nonexistent_dir)

        assert nonexistent_dir.exists()
        assert (nonexistent_dir / "CODE_MAP.json").exists()

    def test_download_results_s3_error(
        self, s3_storage: S3Storage, mock_s3_client: Mock, temp_local_dir: Path
    ) -> None:
        """Test handling S3 errors during download."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access Denied"}},
            "ListObjectsV2",
        )
        mock_s3_client.get_paginator.return_value = mock_paginator

        with pytest.raises(ClientError):
            s3_storage.download_results("job123", temp_local_dir)


class TestUploadResults:
    """Tests for uploading results to S3."""

    def test_upload_results_success(
        self, s3_storage: S3Storage, mock_s3_client: Mock, temp_local_dir: Path
    ) -> None:
        """Test successful result upload."""
        # Create test files
        (temp_local_dir / "CODE_MAP.json").write_text('{"version": "1.0"}')
        (temp_local_dir / "module.mermaid").write_text("graph TD")

        s3_storage.upload_results("job123", temp_local_dir)

        assert mock_s3_client.upload_file.call_count == 2

    def test_upload_results_directory_not_found(
        self, s3_storage: S3Storage, temp_local_dir: Path
    ) -> None:
        """Test upload with nonexistent directory."""
        nonexistent = temp_local_dir / "nonexistent"

        with pytest.raises(FileNotFoundError):
            s3_storage.upload_results("job123", nonexistent)

    def test_upload_results_empty_directory(
        self, s3_storage: S3Storage, mock_s3_client: Mock, temp_local_dir: Path
    ) -> None:
        """Test uploading empty directory."""
        s3_storage.upload_results("job123", temp_local_dir)

        # Should not upload any files
        mock_s3_client.upload_file.assert_not_called()

    def test_upload_results_s3_error(
        self, s3_storage: S3Storage, mock_s3_client: Mock, temp_local_dir: Path
    ) -> None:
        """Test handling S3 errors during upload."""
        (temp_local_dir / "test.txt").write_text("test")
        mock_s3_client.upload_file.side_effect = ClientError(
            {"Error": {"Code": "NoSuchBucket", "Message": "Bucket not found"}},
            "PutObject",
        )

        with pytest.raises(ClientError):
            s3_storage.upload_results("job123", temp_local_dir)


class TestS3StorageInterfaceCompatibility:
    """Tests ensuring S3Storage matches ResultsStorage interface."""

    def test_has_save_results_method(self, s3_storage: S3Storage) -> None:
        """Test S3Storage has save_results method."""
        assert hasattr(s3_storage, "save_results")
        assert callable(getattr(s3_storage, "save_results"))

    def test_has_get_code_map_method(self, s3_storage: S3Storage) -> None:
        """Test S3Storage has get_code_map method."""
        assert hasattr(s3_storage, "get_code_map")
        assert callable(getattr(s3_storage, "get_code_map"))

    def test_has_get_diagram_method(self, s3_storage: S3Storage) -> None:
        """Test S3Storage has get_diagram method."""
        assert hasattr(s3_storage, "get_diagram")
        assert callable(getattr(s3_storage, "get_diagram"))

    def test_has_list_jobs_method(self, s3_storage: S3Storage) -> None:
        """Test S3Storage has list_jobs method."""
        assert hasattr(s3_storage, "list_jobs")
        assert callable(getattr(s3_storage, "list_jobs"))

    def test_has_delete_results_method(self, s3_storage: S3Storage) -> None:
        """Test S3Storage has delete_results method."""
        assert hasattr(s3_storage, "delete_results")
        assert callable(getattr(s3_storage, "delete_results"))
