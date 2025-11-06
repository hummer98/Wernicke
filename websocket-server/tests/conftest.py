"""
Test configuration and fixtures
テスト設定とフィクスチャ
"""

import pytest
import sys
from unittest.mock import Mock, MagicMock

# Mock whisper module before any imports
whisper_mock = MagicMock()
whisper_mock.load_model = Mock(return_value=MagicMock())
sys.modules['whisper'] = whisper_mock


@pytest.fixture(autouse=True)
def mock_whisper_module():
    """
    Automatically mock whisper module for all tests
    すべてのテストでwhisperモジュールを自動的にモック
    """
    return whisper_mock
