---
description: プロジェクトのリリース準備（CHANGELOG更新、バージョン更新、タグ作成）
---

引数: [major|minor|patch|バージョン番号] [auto]

例:
- `/release minor` - マイナーバージョンアップ（承認あり）
- `/release 1.0.0 auto` - v1.0.0へ自動実行（承認なし）
- `/release auto` - 自動判定で自動実行

## 実行手順

### Phase 1: 分析と提案

1. **バージョン決定**
   - 引数がmajor/minor/patchの場合: 現在のバージョンから自動計算
   - 引数が具体的なバージョン番号の場合: そのバージョンを使用
   - 引数なしの場合: コミット履歴から自動判定（feat=minor, fix=patch）

2. **変更履歴の収集**
   ```bash
   # 前回のタグからの変更を取得（タグがない場合は全履歴）
   git log --oneline [前回タグ]..HEAD
   ```

3. **CHANGELOG生成**
   - Keep a Changelog形式（https://keepachangelog.com/ja/）
   - コミットメッセージのプレフィックスで分類:
     - feat: → ### Added
     - fix: → ### Fixed
     - docs: → ### Documentation
     - refactor: → ### Changed
     - chore: → (明示的に重要な場合のみ記載)
   - 日付は今日（YYYY-MM-DD形式）

4. **承認確認（autoオプションがない場合のみ）**
   - 新しいバージョン番号を明示
   - 生成されたCHANGELOGエントリの全文を表示
   - ユーザーに承認を求める（「このまま実行してよろしいですか？ [y/N]」）
   - Nの場合: 処理を中断し、修正方法を案内
   - Yの場合: Phase 2へ進む

### Phase 2: 実行（承認後またはautoオプション時）

5. **package.json更新**
   ```
   webapp/package.json の "version" フィールドを更新
   ```

6. **CHANGELOG.md更新**
   - 既存のCHANGELOG.mdがあれば新規エントリを先頭に追加
   - なければ新規作成

7. **コミットとタグ作成**
   ```bash
   git add CHANGELOG.md webapp/package.json
   git commit -m "chore: release v{version}"
   git tag v{version}
   ```

### Phase 3: プッシュ確認（autoオプションがない場合のみ）

8. **リモートプッシュの確認**
   - 作成したCHANGELOGとtagを表示
   - ユーザーにリモートリポジトリへのプッシュを確認（「リモートリポジトリにプッシュしますか？ [y/N]」）
   - Yの場合: `git push && git push --tags` を実行
   - Nの場合: 手動プッシュの方法を案内
   - autoオプションがある場合: 自動的にプッシュを実行

9. **完了メッセージ**
   - リリース完了を通知
   - GitHubのリリースページURLを案内（可能な場合）
