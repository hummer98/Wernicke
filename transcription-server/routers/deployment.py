"""
Deployment Router
デプロイメント管理ルーター
"""

import subprocess
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# Configuration - should be set via environment variables in production
REPO_DIR = Path(os.getenv("REPO_DIR", "/path/to/transcription-server"))
SERVICE_NAME = os.getenv("SERVICE_NAME", "transcription-server")


@router.post("/deploy")
async def deploy() -> Dict[str, Any]:
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
            text=True,
        )

        # Check dependency changes
        diff_result = subprocess.run(
            ["git", "diff", "HEAD@{1}", "HEAD", "--name-only"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
        )

        updated_files = [f for f in diff_result.stdout.strip().split("\n") if f]
        deps_updated = False

        # Check if requirements.txt was updated
        if "requirements.txt" in diff_result.stdout:
            subprocess.run(
                ["pip", "install", "-r", "requirements.txt"],
                cwd=REPO_DIR,
                check=True,
                capture_output=True,
            )
            deps_updated = True

        # Restart service with pm2
        subprocess.run(
            ["pm2", "restart", SERVICE_NAME], check=True, capture_output=True
        )

        return {
            "status": "success",
            "git_output": result.stdout,
            "updated_files": updated_files,
            "dependencies_updated": deps_updated,
            "timestamp": datetime.now().isoformat(),
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Deployment failed",
                "message": e.stderr if e.stderr else str(e),
                "stdout": e.stdout if hasattr(e, "stdout") else None,
            },
        )


@router.post("/restart")
async def restart() -> Dict[str, Any]:
    """
    サービス再起動のみ（デプロイなし）

    Returns:
        - status: 再起動成功/失敗
        - timestamp: 再起動時刻
    """
    try:
        subprocess.run(
            ["pm2", "restart", SERVICE_NAME], check=True, capture_output=True
        )
        return {"status": "restarted", "timestamp": datetime.now().isoformat()}
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500, detail={"error": "Restart failed", "message": str(e)}
        )


@router.get("/status")
async def get_status() -> Dict[str, Any]:
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
            ["pm2", "jlist"], capture_output=True, text=True, check=True
        )
        processes = json.loads(result.stdout)

        # Filter for transcription-server
        target = next((p for p in processes if p.get("name") == SERVICE_NAME), None)

        if target:
            pm2_env = target.get("pm2_env", {})
            monit = target.get("monit", {})

            return {
                "status": pm2_env.get("status"),
                "uptime": pm2_env.get("pm_uptime"),
                "memory": monit.get("memory"),
                "cpu": monit.get("cpu"),
                "restarts": pm2_env.get("restart_time", 0),
                "timestamp": datetime.now().isoformat(),
            }
        else:
            return {
                "status": "not found",
                "message": f"Service '{SERVICE_NAME}' is not running",
                "timestamp": datetime.now().isoformat(),
            }

    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500, detail={"error": "Status check failed", "message": str(e)}
        )
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to parse pm2 output", "message": str(e)},
        )


@router.get("/logs")
async def get_logs(lines: int = Query(default=100, ge=1, le=10000)) -> Dict[str, Any]:
    """
    サービスログ取得

    Args:
        lines: 取得する行数（デフォルト100、最大10000）

    Returns:
        - logs: ログ内容（文字列）
        - lines: 取得した行数
        - timestamp: 取得時刻
    """
    try:
        result = subprocess.run(
            ["pm2", "logs", SERVICE_NAME, "--lines", str(lines), "--nostream"],
            capture_output=True,
            text=True,
            check=True,
        )
        return {
            "logs": result.stdout,
            "lines": lines,
            "timestamp": datetime.now().isoformat(),
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500, detail={"error": "Failed to get logs", "message": str(e)}
        )


@router.get("/version")
async def get_version() -> Dict[str, Any]:
    """
    現在デプロイされているGitコミット情報

    Returns:
        - commit_hash: コミットハッシュ（短縮版）
        - commit_hash_full: コミットハッシュ（完全版）
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
            check=True,
        ).stdout.strip()

        commit_msg = subprocess.run(
            ["git", "log", "-1", "--pretty=%s"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

        commit_date = subprocess.run(
            ["git", "log", "-1", "--pretty=%ci"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

        branch = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

        return {
            "commit_hash": commit_hash[:7],
            "commit_hash_full": commit_hash,
            "commit_message": commit_msg,
            "commit_date": commit_date,
            "branch": branch,
            "timestamp": datetime.now().isoformat(),
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get version info", "message": str(e)},
        )
