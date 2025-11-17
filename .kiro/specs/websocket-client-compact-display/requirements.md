# Requirements Document

## Introduction

WebSocketクライアントに新しいCompact表示モードを追加します。このモードは、リアルタイム音声文字起こしの結果をシンプルで読みやすいテキスト形式で表示し、ユーザーが会話の流れを自然に追えるようにします。デフォルトの表示モードとして動作し、必要に応じて詳細なverboseモードに切り替えることができます。

## Requirements

### Requirement 1: 表示モード切り替え機能

**Objective:** 開発者として、コマンドライン引数で表示モードを選択できるようにしたい。これにより、用途に応じて最適な表示形式を使用できる。

#### Acceptance Criteria

1. WHEN WebSocketクライアントが引数なしで起動される THEN クライアントはCompact表示モードで動作する
2. WHEN WebSocketクライアントが `--display=verbose` 引数付きで起動される THEN クライアントは既存のJSON形式表示モードで動作する
3. WHEN WebSocketクライアントが `--display=compact` 引数付きで起動される THEN クライアントはCompact表示モードで動作する
4. WHEN 無効な `--display` 値が指定される THEN クライアントはエラーメッセージを表示して終了する

### Requirement 2: Partialメッセージの逐次表示

**Objective:** ユーザーとして、音声認識の途中結果（Partial）をリアルタイムで確認したい。これにより、認識が進行中であることを把握でき、最終結果を待つ間も内容を追うことができる。

#### Acceptance Criteria

1. WHEN Partialメッセージを受信する THEN クライアントは `[Now][Speaker X] テキスト内容` 形式で表示する
2. WHEN 新しいPartialメッセージを受信する THEN クライアントはカーソル制御（`\r` または ANSI escape sequences）を使用して同じ行を上書き更新する
3. WHEN Partialメッセージのテキストが空である THEN クライアントは `[Now]` のみを表示する
4. WHEN 連続してPartialメッセージを受信する THEN クライアントは最新のPartial内容のみを表示し続ける
5. WHERE Compact表示モードが有効である THE クライアントはPartial行を常に画面の最終行に表示する

### Requirement 3: Finalメッセージの確定表示

**Objective:** ユーザーとして、音声認識の確定結果（Final）を明確に区別して記録したい。これにより、認識が完了した正確なテキストを履歴として保持できる。

#### Acceptance Criteria

1. WHEN Finalメッセージを受信する THEN クライアントは現在表示中のPartial行を消去する
2. WHEN Finalメッセージを受信する THEN クライアントは `[HH:MM:SS][Speaker X] 確定テキスト` 形式で表示する
3. WHEN Finalメッセージを表示する THEN クライアントはタイムスタンプに現在時刻を使用する
4. WHEN Finalメッセージを表示した後 THEN クライアントは改行して新しい `[Now]` 行を表示する
5. WHEN 複数のFinalメッセージを受信する THEN クライアントは全てのFinal結果を履歴として保持し、スクロール可能な状態で表示する

### Requirement 4: 話者情報の表示

**Objective:** ユーザーとして、誰が話しているかを識別したい。これにより、複数話者の会話を理解しやすくする。

#### Acceptance Criteria

1. WHEN Partialメッセージに話者情報が含まれる THEN クライアントは `[Now][Speaker X]` 形式で話者番号を表示する
2. WHEN Finalメッセージに話者情報が含まれる THEN クライアントは `[HH:MM:SS][Speaker X]` 形式で話者番号を表示する
3. WHEN メッセージに話者情報が含まれない THEN クライアントは話者部分を省略する

### Requirement 5: Verboseモードの互換性維持

**Objective:** 開発者として、既存のJSON形式表示機能を維持したい。これにより、デバッグや詳細ログ確認が必要な場合に利用できる。

#### Acceptance Criteria

1. WHEN `--display=verbose` モードが指定される THEN クライアントは既存の全てのJSON形式メッセージ表示機能を保持する
2. WHEN `--display=verbose` モードが指定される THEN クライアントはPartialとFinalの両方のメッセージを完全なJSON形式で出力する
3. WHERE `--display=verbose` モードが有効である THE クライアントはCompact表示の動作を実行しない

### Requirement 6: ターミナル表示の制御

**Objective:** 開発者として、ターミナル上で適切なカーソル制御を行いたい。これにより、スムーズな逐次更新とクリーンな表示を実現できる。

#### Acceptance Criteria

1. WHEN Partial行を更新する THEN クライアントはカーソルを行頭に戻す制御シーケンス（`\r`）を使用する
2. WHEN Partial行をFinalに置き換える THEN クライアントは現在の行をクリアしてからFinal内容を表示する
3. WHEN 長いテキストが画面幅を超える THEN クライアントはテキストを切り詰めずに自然に折り返す
4. WHERE ターミナルがANSI escape sequencesをサポートしている THE クライアントは適切なエスケープシーケンスを使用して表示を制御する
