"""
Test Health Check Endpoint
Task 14.1: サーバー側ヘルスチェックエンドポイント
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def client():
    """Create test client"""
    from main import app
    return TestClient(app)


class TestTask14_1HealthEndpoint:
    """Test suite for Task 14.1: Server-side health check endpoint"""

    def test_health_endpoint_returns_200_when_healthy(self, client):
        """
        Test: Health endpoint returns 200 OK when service is healthy
        Task: 14.1
        Given: Server is running normally with GPU available
        When: GET /health is called
        Then: Returns 200 OK status code
        """
        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.mem_get_info', return_value=(8 * 1024**3, 12 * 1024**3)):
                response = client.get("/health")
                assert response.status_code == 200

    def test_health_endpoint_returns_gpu_vram_usage(self, client):
        """
        Test: Health endpoint returns GPU VRAM usage information
        Task: 14.1
        Given: GPU is available
        When: GET /health is called
        Then: Response contains gpu_vram_used_mb and gpu_vram_total_mb
        """
        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.mem_get_info') as mock_mem_info:
                # Mock: 12GB total, 4GB used (8GB free)
                mock_mem_info.return_value = (8 * 1024**3, 12 * 1024**3)  # (free, total) in bytes

                response = client.get("/health")
                data = response.json()

                assert 'gpu_vram_used_mb' in data
                assert 'gpu_vram_total_mb' in data
                assert data['gpu_vram_total_mb'] == 12288  # 12GB in MB
                assert data['gpu_vram_used_mb'] == 4096    # 4GB in MB

    def test_health_endpoint_returns_active_sessions_count(self, client):
        """
        Test: Health endpoint returns active WebSocket sessions count
        Task: 14.1
        Given: Server has active WebSocket connections
        When: GET /health is called
        Then: Response contains active_sessions count
        """
        response = client.get("/health")
        data = response.json()

        assert 'active_sessions' in data
        assert isinstance(data['active_sessions'], int)
        assert data['active_sessions'] >= 0

    def test_health_endpoint_returns_503_when_gpu_unavailable(self, client):
        """
        Test: Health endpoint returns 503 Service Unavailable when GPU is not available
        Task: 14.1
        Given: GPU is not available or CUDA error occurs
        When: GET /health is called
        Then: Returns 503 Service Unavailable status code
        """
        with patch('torch.cuda.is_available', return_value=False):
            response = client.get("/health")

            # Should return 503 when GPU is unavailable
            assert response.status_code == 503
            data = response.json()
            assert 'status' in data
            assert data['status'] == 'unhealthy'

    def test_health_endpoint_includes_status_field(self, client):
        """
        Test: Health endpoint includes status field
        Task: 14.1
        Given: Server is running
        When: GET /health is called
        Then: Response contains status="healthy" or status="unhealthy"
        """
        response = client.get("/health")
        data = response.json()

        assert 'status' in data
        assert data['status'] in ['healthy', 'unhealthy']

    def test_health_endpoint_gpu_unavailable_includes_reason(self, client):
        """
        Test: Health endpoint includes reason when unhealthy
        Task: 14.1
        Given: GPU is not available
        When: GET /health is called
        Then: Response includes reason for unhealthy status
        """
        with patch('torch.cuda.is_available', return_value=False):
            response = client.get("/health")
            data = response.json()

            assert 'reason' in data or 'message' in data
            if 'reason' in data:
                assert 'GPU' in data['reason'] or 'CUDA' in data['reason']

    def test_health_endpoint_response_structure(self, client):
        """
        Test: Health endpoint response has expected structure
        Task: 14.1
        Given: Server is running normally with GPU
        When: GET /health is called
        Then: Response contains all required fields
        """
        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.mem_get_info', return_value=(8 * 1024**3, 12 * 1024**3)):
                response = client.get("/health")
                data = response.json()

                # Verify required fields exist
                assert 'status' in data
                assert 'active_sessions' in data
                assert 'gpu_vram_used_mb' in data
                assert 'gpu_vram_total_mb' in data

                # Verify types
                assert isinstance(data['status'], str)
                assert isinstance(data['active_sessions'], int)
                assert isinstance(data['gpu_vram_used_mb'], (int, float))
                assert isinstance(data['gpu_vram_total_mb'], (int, float))
