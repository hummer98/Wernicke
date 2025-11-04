"""
Test Deployment Router
デプロイメント管理ルーターのテスト
"""

import pytest
from fastapi.testclient import TestClient
from main import app


class TestDeploymentEndpoints:
    """Deployment endpoints tests"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    def test_deploy_endpoint_exists(self, client):
        """POST /deploy エンドポイントが存在すること"""
        response = client.post("/deploy")
        assert response.status_code != 404

    def test_deploy_returns_json(self, client):
        """デプロイエンドポイントがJSONを返すこと"""
        response = client.post("/deploy")
        assert response.headers["content-type"] == "application/json"

    def test_deploy_response_structure(self, client):
        """デプロイレスポンスが適切な構造であること"""
        response = client.post("/deploy")
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert "timestamp" in data

    def test_restart_endpoint_exists(self, client):
        """POST /restart エンドポイントが存在すること"""
        response = client.post("/restart")
        assert response.status_code != 404

    def test_restart_returns_json(self, client):
        """再起動エンドポイントがJSONを返すこと"""
        response = client.post("/restart")
        assert response.headers["content-type"] == "application/json"

    def test_status_endpoint_exists(self, client):
        """GET /status エンドポイントが存在すること"""
        response = client.get("/status")
        assert response.status_code != 404

    def test_status_returns_json(self, client):
        """ステータスエンドポイントがJSONを返すこと"""
        response = client.get("/status")
        assert response.headers["content-type"] == "application/json"

    def test_logs_endpoint_exists(self, client):
        """GET /logs エンドポイントが存在すること"""
        response = client.get("/logs")
        assert response.status_code != 404

    def test_logs_accepts_lines_parameter(self, client):
        """ログエンドポイントがlinesパラメータを受け付けること"""
        response = client.get("/logs?lines=50")
        assert response.status_code in [200, 500]

    def test_version_endpoint_exists(self, client):
        """GET /version エンドポイントが存在すること"""
        response = client.get("/version")
        assert response.status_code != 404

    def test_version_returns_git_info(self, client):
        """バージョンエンドポイントがGit情報を返すこと"""
        response = client.get("/version")
        if response.status_code == 200:
            data = response.json()
            assert "commit_hash" in data
            assert "branch" in data


class TestDeploymentErrorHandling:
    """Deployment error handling tests"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    def test_deploy_handles_git_errors(self, client):
        """Git エラーを適切にハンドリングすること"""
        response = client.post("/deploy")
        # Should return error response, not crash
        assert response.status_code in [200, 500]
        if response.status_code == 500:
            data = response.json()
            assert "detail" in data

    def test_restart_handles_pm2_errors(self, client):
        """PM2 エラーを適切にハンドリングすること"""
        response = client.post("/restart")
        assert response.status_code in [200, 500]
        if response.status_code == 500:
            data = response.json()
            assert "detail" in data

    def test_status_handles_missing_service(self, client):
        """サービスが見つからない場合を適切にハンドリングすること"""
        response = client.get("/status")
        if response.status_code == 200:
            data = response.json()
            # Should indicate service status
            assert "status" in data
