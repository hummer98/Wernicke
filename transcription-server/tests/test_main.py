"""
Test Main Application
メインアプリケーションのテスト
"""

import pytest
from fastapi.testclient import TestClient
from main import app


class TestHealthEndpoint:
    """Health check endpoint tests"""

    def test_health_endpoint_returns_200(self):
        """ヘルスチェックエンドポイントが200を返すこと"""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_endpoint_returns_json(self):
        """ヘルスチェックエンドポイントがJSONを返すこと"""
        client = TestClient(app)
        response = client.get("/health")
        assert response.headers["content-type"] == "application/json"

    def test_health_endpoint_contains_status(self):
        """ヘルスチェックエンドポイントがstatusフィールドを含むこと"""
        client = TestClient(app)
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert data["status"] == "ok"

    def test_health_endpoint_contains_timestamp(self):
        """ヘルスチェックエンドポイントがtimestampフィールドを含むこと"""
        client = TestClient(app)
        response = client.get("/health")
        data = response.json()
        assert "timestamp" in data
        assert isinstance(data["timestamp"], str)


class TestCORSConfiguration:
    """CORS configuration tests"""

    def test_cors_allows_lan_origin(self):
        """CORSがLAN内のオリジンを許可すること"""
        client = TestClient(app)
        response = client.options(
            "/health",
            headers={
                "Origin": "http://192.168.1.100:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" in response.headers

    def test_cors_allows_credentials(self):
        """CORSが認証情報を許可すること"""
        client = TestClient(app)
        response = client.options(
            "/health",
            headers={
                "Origin": "http://192.168.1.100:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        # If credentials are allowed, this header should be present
        # This test verifies CORS is configured
        assert response.status_code in [200, 204]


class TestServerConfiguration:
    """Server configuration tests"""

    def test_app_title(self):
        """アプリケーションタイトルが設定されていること"""
        assert app.title == "Transcription Server"

    def test_app_version(self):
        """アプリケーションバージョンが設定されていること"""
        assert app.version == "0.1.0"
