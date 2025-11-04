# Wernicke

**日本語** | [English](README.md)

連続音声文字起こしと処理のための総合スイート

## プロジェクト

### 📝 [continuous-audio-transcription](continuous-audio-transcription/)

24時間連続音声文字起こしシステム - BlackHole + WhisperX + 話者分離

**主要機能:**
- 24時間365日の音声キャプチャと文字起こし
- 長期稼働のためのメモリ効率設計
- 中断からの自動復帰
- 話者分離（オプション）
- 自動ファイルローテーションと圧縮
- リソース監視とアラート
- サービス管理用CLIインターフェース

**技術スタック:** TypeScript, Node.js, FFmpeg, PM2

[ドキュメント](continuous-audio-transcription/README.ja.md) | [クイックセットアップ](continuous-audio-transcription/SETUP.md)

### 🖥️ [transcription-server](transcription-server/)

高性能音声認識のためのWhisperX CUDAサーバー

**主要機能:**
- FastAPIベースのREST API
- CUDA高速化による文字起こし
- 話者分離サポート
- 多言語対応
- バッチ処理

**技術スタック:** Python, FastAPI, WhisperX, PyTorch, CUDA

[ドキュメント](transcription-server/README.md)

## クイックスタート

### 1. リポジトリをクローン

```bash
git clone https://github.com/your-username/Wernicke.git
cd Wernicke
```

### 2. 文字起こしサービスのセットアップ

```bash
cd continuous-audio-transcription
npm install
npm run build
cp config.example.json config.json
# config.jsonを編集
```

### 3. CUDAサーバーのセットアップ

```bash
cd transcription-server
# docs/内のセットアップ手順に従う
```

詳細なセットアップ手順は各プロジェクトのREADMEを参照してください。

## システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                   Wernickeシステム                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │ 連続音声文字起こし       │  │ 文字起こしサーバー        │ │
│  │                          │  │ (WhisperX CUDA)          │ │
│  │                          │  │                          │ │
│  │ - 音声キャプチャ         │  │ - FastAPIサーバー        │ │
│  │ - バッファ管理           │◄─┤ - WhisperXエンジン      │ │
│  │ - ファイル処理           │  │ - 話者分離               │ │
│  │ - CLIインターフェース    │  │ - 多言語対応             │ │
│  │                          │  │                          │ │
│  │ 技術: TypeScript/Node.js │  │ 技術: Python/PyTorch     │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 機能

### 連続音声文字起こし
- ✅ 24時間365日連続稼働
- ✅ エラーからの自動復帰
- ✅ メモリ効率的なバッファリング
- ✅ 自動ファイルローテーション
- ✅ ヘルス監視
- ✅ CLI管理

### 文字起こしサーバー
- ✅ CUDA高速化処理
- ✅ RESTful API
- ✅ 話者分離
- ✅ 多言語サポート
- ✅ バッチ処理

## システム要件

### 連続音声文字起こし用
- macOS 10.15以降 または Linux（Ubuntu 20.04以降）
- Node.js 18以降
- FFmpeg 4.4以降
- BlackHole 2ch（macOS）または同等品
- 10GB以上のディスク容量

### 文字起こしサーバー用
- Linux（Ubuntu 20.04以降）または Windows 10/11
- Python 3.9-3.11
- NVIDIA GPU（VRAM 4GB以上）
- CUDA 11.8以降
- cuDNN 8.6以降

## ドキュメント

- [連続音声文字起こしドキュメント](continuous-audio-transcription/README.ja.md)
- [CUDAサーバーセットアップガイド](continuous-audio-transcription/docs/cuda-server-setup.md)
- [Claude CodeによるWindowsセットアップ](continuous-audio-transcription/docs/windows-setup-prompt.md)
- [貢献ガイドライン](CONTRIBUTING.md)

## 開発

これは複数の関連プロジェクトを含むモノレポです。各プロジェクトには独自の：
- ドキュメント
- テスト
- ビルド設定
- 依存関係

があります。

### テスト

```bash
# continuous-audio-transcriptionのテスト
cd continuous-audio-transcription
npm test

# transcription-serverのテスト
cd transcription-server
pytest
```

### コード品質

```bash
# continuous-audio-transcriptionのLint
cd continuous-audio-transcription
npm run lint

# transcription-serverのLint
cd transcription-server
flake8 .
```

## 貢献

貢献を歓迎します！ガイドラインについては[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

## ライセンス

このプロジェクトはMITライセンスの下でライセンスされています。詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 謝辞

- [WhisperX](https://github.com/m-bain/whisperx) - 高速自動音声認識
- [pyannote.audio](https://github.com/pyannote/pyannote-audio) - 話者分離
- [BlackHole](https://existential.audio/blackhole/) - 仮想オーディオドライバー
- [FFmpeg](https://ffmpeg.org/) - マルチメディアフレームワーク

---

🤖 [Claude Code](https://claude.com/claude-code)で生成

Co-Authored-By: Claude <noreply@anthropic.com>
