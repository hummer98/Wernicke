from fastapi import FastAPI, HTTPException
import subprocess
from pathlib import Path
from datetime import datetime
import json

app = FastAPI(title="Transcription Server Deployment API")

# 設定 - 実際の環境に合わせて変更してください
REPO_DIR = Path("/path/to/continuous-audio-transcription")
SERVICE_NAME = "transcription-server"

@app.post("/deploy")
async def deploy():
    """
    Git pullしてサービス再起動

    Returns:
        - status: デプロイ成功/失敗
        - git_output: git pullの出力
        - updated_files: 更新されたファイル一覧
        - dependencies_updated: 依存関係が更新されたか
    """
    try:
        # Git pull
        result = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=REPO_DIR,
            check=True,
            capture_output=True,
            text=True
        )

        # 依存関係チェック（前回のコミットとの差分）
        diff_result = subprocess.run(
            ["git", "diff", "HEAD@{1}", "HEAD", "--name-only"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True
        )

        updated_files = [f for f in diff_result.stdout.strip().split('\n') if f]
        deps_updated = False

        # requirements.txt が更新されたか確認
        if "server/requirements.txt" in diff_result.stdout:
            subprocess.run(
                ["pip", "install", "-r", "server/requirements.txt"],
                cwd=REPO_DIR,
                check=True,
                capture_output=True
            )
            deps_updated = True

        # pm2でサービス再起動
        subprocess.run(
            ["pm2", "restart", SERVICE_NAME],
            check=True,
            capture_output=True
        )

        return {
            "status": "success",
            "git_output": result.stdout,
            "updated_files": updated_files,
            "dependencies_updated": deps_updated,
            "timestamp": datetime.now().isoformat()
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Deployment failed",
                "message": e.stderr if e.stderr else str(e),
                "stdout": e.stdout if hasattr(e, 'stdout') else None
            }
        )

@app.post("/restart")
async def restart():
    """
    サービス再起動のみ（デプロイなし）

    Returns:
        - status: 再起動成功/失敗
    """
    try:
        subprocess.run(
            ["pm2", "restart", SERVICE_NAME],
            check=True,
            capture_output=True
        )
        return {
            "status": "restarted",
            "timestamp": datetime.now().isoformat()
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Restart failed", "message": str(e)}
        )

@app.get("/status")
async def status():
    """
    サービス状態確認

    Returns:
        - status: online/stopped/errored/not found
        - uptime: 起動時刻（Unix timestamp）
        - memory: メモリ使用量（bytes）
        - cpu: CPU使用率（%）
        - restarts: 再起動回数
    """
    try:
        result = subprocess.run(
            ["pm2", "jlist"],
            capture_output=True,
            text=True,
            check=True
        )
        processes = json.loads(result.stdout)

        # transcription-serverのみフィルタ
        target = next(
            (p for p in processes if p.get("name") == SERVICE_NAME),
            None
        )

        if target:
            pm2_env = target.get("pm2_env", {})
            monit = target.get("monit", {})

            return {
                "status": pm2_env.get("status"),
                "uptime": pm2_env.get("pm_uptime"),
                "memory": monit.get("memory"),
                "cpu": monit.get("cpu"),
                "restarts": pm2_env.get("restart_time", 0),
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "not found",
                "message": f"Service '{SERVICE_NAME}' is not running",
                "timestamp": datetime.now().isoformat()
            }

    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Status check failed", "message": str(e)}
        )
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to parse pm2 output", "message": str(e)}
        )

@app.get("/logs")
async def get_logs(lines: int = 100):
    """
    サービスログ取得

    Args:
        lines: 取得する行数（デフォルト100）

    Returns:
        - logs: ログ内容（文字列）
    """
    try:
        result = subprocess.run(
            ["pm2", "logs", SERVICE_NAME, "--lines", str(lines), "--nostream"],
            capture_output=True,
            text=True,
            check=True
        )
        return {
            "logs": result.stdout,
            "lines": lines,
            "timestamp": datetime.now().isoformat()
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get logs", "message": str(e)}
        )

@app.get("/version")
async def get_version():
    """
    現在デプロイされているGitコミット情報

    Returns:
        - commit_hash: コミットハッシュ（短縮版）
        - commit_message: コミットメッセージ
        - commit_date: コミット日時
        - branch: 現在のブランチ
    """
    try:
        commit_hash = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        commit_msg = subprocess.run(
            ["git", "log", "-1", "--pretty=%s"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        commit_date = subprocess.run(
            ["git", "log", "-1", "--pretty=%ci"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        branch = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        return {
            "commit_hash": commit_hash[:7],
            "commit_hash_full": commit_hash,
            "commit_message": commit_msg,
            "commit_date": commit_date,
            "branch": branch,
            "timestamp": datetime.now().isoformat()
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get version info", "message": str(e)}
        )

@app.get("/health")
async def health():
    """
    デプロイメントサーバー自体のヘルスチェック

    Returns:
        - status: ok
        - timestamp: 現在時刻
    """
    return {
        "status": "ok",
        "service": "deployment-server",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/")
async def root():
    """
    APIルート - 利用可能なエンドポイント一覧
    """
    return {
        "service": "Transcription Server Deployment API",
        "endpoints": {
            "POST /deploy": "Git pullしてサービス再起動",
            "POST /restart": "サービス再起動のみ",
            "GET /status": "サービス状態確認",
            "GET /logs?lines=N": "サービスログ取得（デフォルト100行）",
            "GET /version": "現在のGitコミット情報",
            "GET /health": "デプロイメントサーバーのヘルスチェック"
        },
        "usage": {
            "deploy": "curl -X POST http://SERVER_IP:9000/deploy",
            "restart": "curl -X POST http://SERVER_IP:9000/restart",
            "status": "curl http://SERVER_IP:9000/status",
            "logs": "curl http://SERVER_IP:9000/logs?lines=50",
            "version": "curl http://SERVER_IP:9000/version",
            "health": "curl http://SERVER_IP:9000/health"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
