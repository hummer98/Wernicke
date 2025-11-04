# Windows CUDA Python環境セットアップパターン

## 前提条件確認
- Python 3.9-3.11（バージョン範囲確認）
- NVIDIA GPU（nvidia-smi でCUDAバージョン確認）
- Git
- ffmpeg（WhisperX音声処理に必須）
  - Windows: `choco install ffmpeg`
  - または https://www.gyan.dev/ffmpeg/builds/ から手動インストール
  - 環境変数PATHに`C:\ffmpeg\bin`追加
  - 確認: `ffmpeg -version`

## セットアップ手順
1. 仮想環境作成: `python -m venv [env-name]`
2. pip更新: `[env]/Scripts/python.exe -m pip install --upgrade pip setuptools wheel`
3. **重要**: PyTorchインストール前に依存パッケージの要求バージョンを確認
4. PyTorch CUDA版: `pip install torch==X.X.X --index-url https://download.pytorch.org/whl/cu121`
5. 依存パッケージインストール
6. テストスクリプトでCUDA動作確認

## トラブルシューティング
- パス問題: Git Bash環境では `/` 区切り使用
- 依存関係競合: `pip show [package]` で現在のバージョン確認後、互換バージョンを選択
- 文字化け: UTF-8エンコーディング設定（`io.TextIOWrapper`）
- torchvision互換性エラー: PyTorchバージョンを調整（例: 2.8.0が未対応なら2.5.1）

## PyTorch/transformers互換性（2025-11）
- **CVE-2025-32434対策**: transformers 4.44.2使用（PyTorch 2.5.1で動作）
- transformers 4.52+はPyTorch 2.6+必須だが、CUDA 12.1版PyTorch 2.6未提供
- 解決策: `pip install transformers==4.44.2 --force-reinstall`

## Chocolatey使用時の注意
- インストール後、`choco`コマンド認識にはPowerShell再起動必須
- 既存インストール検出エラー時: `Remove-Item -Path "C:\ProgramData\chocolatey" -Recurse -Force`

## Git Bashでのパス処理
- Windows環境でもUnix形式のパス区切り `/` を使用
- 仮想環境のPythonは `whisperx-env/Scripts/python.exe` の形式
- バックスラッシュ `\` は使用不可

## 依存関係管理
- pip installの依存関係競合時、`--force-reinstall --no-deps` は避ける
- まず互換バージョンを確認してから適切なバージョンを指定
- PyTorchのCUDAバージョンは `--index-url` で明示的に指定

## Windows Console出力
- UTF-8エンコーディング設定が必須:
  ```python
  import sys
  import io
  sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
  ```
- 特殊文字（✓, ✗など）は避け、`[OK]`, `[ERROR]`を使用
