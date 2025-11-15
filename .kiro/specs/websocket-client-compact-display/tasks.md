# Implementation Plan

## 概要

WebSocketクライアントにCompact表示モードを実装します。このモードは、リアルタイム音声文字起こしの結果をシンプルなテキスト形式でコンソールに表示します。Partialメッセージは逐次更新され、Finalメッセージは確定結果として履歴に追加されます。

## 実装タスク

- [ ] 1. 表示モード型定義の追加
- [x] 1.1 DisplayMode型を型定義ファイルに追加
  - 'compact' と 'verbose' の2つの値を持つユニオン型を定義
  - 既存のメッセージ型と同じファイルに配置して一元管理
  - 型の再利用性を確保
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. CompactDisplay表示サービスの実装
- [x] 2.1 CompactDisplayクラスの基本構造を作成
  - ITranscriptionDisplayインターフェースを実装
  - 内部状態管理用のhasPartialLineフラグを追加
  - process.stdoutへの参照を保持
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.2 Partialメッセージ表示機能を実装
  - displayPartialResultメソッドを実装
  - `[Now][Speaker X] text` 形式のフォーマット生成
  - カーソル制御（`\r`）で同じ行を上書き更新
  - 話者情報の有無に応じた表示切り替え
  - 空テキスト時は `[Now]` のみ表示
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.3_

- [x] 2.3 Finalメッセージ表示機能を実装
  - displayFinalResultメソッドを実装
  - `[HH:MM:SS][Speaker X] text` 形式のフォーマット生成
  - 現在のPartial行をクリア（`\r\x1b[K`）
  - タイムスタンプ生成（HH:MM:SS形式）
  - 確定テキストを表示後に改行
  - 新しい `[Now]` プレースホルダーを表示
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3_

- [x] 2.4 補助メソッドの実装
  - 話者情報フォーマット機能（formatSpeaker）
  - タイムスタンプフォーマット機能（formatTimestamp）
  - カーソル制御とターミナル表示制御
  - 行クリアとテキスト出力の低レベル処理
  - _Requirements: 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

- [ ] 3. CLI引数解析の拡張
- [x] 3.1 --display引数のパース機能を追加
  - 既存のCLI引数パーサーに--display引数処理を追加
  - 'compact', 'verbose' の値をバリデーション
  - 引数なしの場合はデフォルトで'compact'を設定
  - 無効な値の場合はエラーメッセージを表示して終了
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3.2 DisplayModeに基づくサービス初期化
  - 表示モードに応じてCompactDisplayインスタンスを生成
  - verboseモードの場合は既存の動作を維持
  - compactモードの場合は新しいCompactDisplayを使用
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 4. TranscriptionClientの統合
- [x] 4.1 CompactDisplayサービスの統合
  - TranscriptionClientのコンストラクタにCompactDisplayを受け取る機能を追加
  - Partialメッセージ受信時にCompactDisplayを呼び出し
  - Finalメッセージ受信時にCompactDisplayを呼び出し
  - 既存のTranscriptionDisplay機能を維持（並行動作）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4.2 Verboseモード互換性の確認
  - verboseモード時に既存のJSON形式表示が正常動作すること
  - compactモード時にverboseの動作が実行されないこと
  - 両モードで独立した動作が保証されること
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 5. ユニットテストの実装
- [ ] 5.1 CompactDisplayクラスのテストを作成
  - Partial表示フォーマットの検証テスト
  - Final表示フォーマットの検証テスト
  - タイムスタンプ形式の検証テスト
  - 話者情報フォーマットの検証テスト
  - 空テキスト時の動作検証テスト
  - _Requirements: 2.1, 2.3, 3.3, 4.1, 4.2, 4.3_

- [ ] 5.2 カーソル制御の検証テストを作成
  - Partial更新時の `\r` 使用を検証
  - Final表示時の `\r\x1b[K` 使用を検証
  - Final表示後の `[Now]` 表示を検証
  - 長いテキストの折り返し動作を検証
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 5.3 State管理の検証テストを作成
  - hasPartialLineフラグの状態遷移を検証
  - Partial → Final → Partialシーケンスの動作を検証
  - 初期状態と状態リセットを検証
  - _Requirements: 2.4, 2.5, 3.4_

- [ ] 6. 統合テストの実装
- [ ] 6.1 CLI引数解析の統合テストを作成
  - 引数なし起動でcompactモードが選択されることを検証
  - --display=compactでcompactモードが選択されることを検証
  - --display=verboseでverboseモードが選択されることを検証
  - 無効な値でエラーメッセージが表示されることを検証
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 6.2 TranscriptionClientとCompactDisplayの統合テストを作成
  - Partialメッセージが正しくCompactDisplayに渡されることを検証
  - Finalメッセージが正しくCompactDisplayに渡されることを検証
  - 複数の表示サービスが並行動作することを検証
  - verboseモード時にcompact表示が実行されないことを検証
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 5.1, 5.2, 5.3_

- [ ] 7. エラーハンドリングの実装
- [ ] 7.1 CLI引数エラーハンドリングを追加
  - 無効な--display値のエラーメッセージ表示
  - エラー時のプロセス終了（exit code 1）
  - ユーザーフレンドリーなエラーメッセージ
  - _Requirements: 1.4_

- [ ] 7.2 ランタイムエラーハンドリングの検証
  - 話者情報欠落時の正常動作確認
  - stdout書き込み失敗時の動作確認（例外伝播）
  - エラー発生時のシステム安定性確認
  - _Requirements: 4.3_

- [ ] 8. 実装の検証と最終調整
- [ ] 8.1 全要件のカバレッジ確認
  - 全ての受け入れ基準が実装されていることを確認
  - テストで全ての要件がカバーされていることを確認
  - 要件とコードのトレーサビリティを検証
  - _Requirements: All_

- [ ] 8.2 既存機能への影響確認
  - 既存のTranscriptionDisplay機能が正常動作することを確認
  - WebSocket通信機能が影響を受けていないことを確認
  - 音声キャプチャ機能が影響を受けていないことを確認
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 8.3 コード品質の最終確認
  - TypeScriptの型安全性確認（anyを使用していないこと）
  - 既存のコーディング規約への準拠確認
  - テストカバレッジの確認
  - ドキュメントの更新確認
  - _Requirements: All_
