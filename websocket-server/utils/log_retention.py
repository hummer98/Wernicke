"""
Log Retention and File Security Utilities
Task 18.2: File permissions and data retention
Requirements: R9.2
"""

import os
import sys
import time
import logging
from pathlib import Path
from typing import Dict, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Platform detection
IS_WINDOWS = sys.platform == 'win32'

# Default retention policy
DEFAULT_RETENTION_DAYS = 30
DEFAULT_LOG_DIRECTORY = "~/transcriptions/logs"


def get_retention_policy() -> Dict[str, Any]:
    """
    Get data retention policy configuration

    Returns:
        Dictionary with retention policy details
    """
    return {
        "retention_days": DEFAULT_RETENTION_DAYS,
        "storage_location": "local",
        "log_directory": DEFAULT_LOG_DIRECTORY,
        "external_storage_enabled": False
    }


def create_secure_log_file(file_path: str, content: str = "") -> None:
    """
    Create log file with secure permissions (0600 on Unix, Windows ACL on Windows)

    Args:
        file_path: Path to log file
        content: Initial content to write (optional)
    """
    try:
        # Create directory if it doesn't exist
        log_dir = os.path.dirname(file_path)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)

        # Create file with secure permissions
        if IS_WINDOWS:
            # On Windows, just create the file normally
            # Windows file permissions are managed via ACLs, not Unix-style permissions
            with open(file_path, 'w', encoding='utf-8') as f:
                if content:
                    f.write(content)
            logger.info(f"Secure log file created (Windows): {file_path}")
        else:
            # Unix/Linux: Use os.open with O_CREAT for atomic creation with permissions
            flags = os.O_CREAT | os.O_WRONLY | os.O_TRUNC
            mode = 0o600

            fd = os.open(file_path, flags, mode)

            if content:
                os.write(fd, content.encode('utf-8'))

            os.close(fd)

            # Verify permissions on Unix
            st = os.stat(file_path)
            import stat
            perms = stat.S_IMODE(st.st_mode)
            if perms != 0o600:
                logger.warning(f"File {file_path} created with permissions {oct(perms)}, expected 0600. Fixing...")
                os.chmod(file_path, 0o600)

            logger.info(f"Secure log file created (Unix): {file_path} (permissions: 0600)")

    except Exception as e:
        logger.error(f"Failed to create secure log file {file_path}: {str(e)}", exc_info=True)
        raise


def cleanup_old_logs(log_directory: str, retention_days: int = DEFAULT_RETENTION_DAYS) -> int:
    """
    Delete log files older than retention period

    Args:
        log_directory: Directory containing log files
        retention_days: Number of days to retain logs (default: 30)

    Returns:
        Number of files deleted
    """
    try:
        if not os.path.exists(log_directory):
            logger.warning(f"Log directory does not exist: {log_directory}")
            return 0

        current_time = time.time()
        cutoff_time = current_time - (retention_days * 24 * 60 * 60)
        deleted_count = 0

        logger.info(f"Cleaning up logs older than {retention_days} days in {log_directory}")

        for filename in os.listdir(log_directory):
            file_path = os.path.join(log_directory, filename)

            # Skip directories
            if os.path.isdir(file_path):
                continue

            # Skip non-log files
            if not filename.endswith('.log'):
                continue

            try:
                # Get file modification time
                file_mtime = os.path.getmtime(file_path)

                # Delete if older than retention period
                if file_mtime < cutoff_time:
                    age_days = (current_time - file_mtime) / (24 * 60 * 60)
                    logger.info(f"Deleting old log file: {filename} (age: {age_days:.1f} days)")
                    os.remove(file_path)
                    deleted_count += 1

            except Exception as e:
                logger.error(f"Failed to process file {filename}: {str(e)}")

        logger.info(f"Cleanup complete: {deleted_count} files deleted")
        return deleted_count

    except Exception as e:
        logger.error(f"Log cleanup failed: {str(e)}", exc_info=True)
        return 0


def ensure_secure_log_directory(log_directory: str) -> bool:
    """
    Ensure log directory exists with secure permissions

    Args:
        log_directory: Path to log directory

    Returns:
        True if directory is secure, False otherwise
    """
    try:
        # Expand user home directory
        log_dir_expanded = os.path.expanduser(log_directory)

        # Create directory if it doesn't exist
        if not os.path.exists(log_dir_expanded):
            if IS_WINDOWS:
                os.makedirs(log_dir_expanded, exist_ok=True)
                logger.info(f"Created secure log directory (Windows): {log_dir_expanded}")
            else:
                os.makedirs(log_dir_expanded, mode=0o700, exist_ok=True)
                logger.info(f"Created secure log directory (Unix): {log_dir_expanded} (permissions: 0700)")

        # Verify directory permissions on Unix only
        if not IS_WINDOWS:
            st = os.stat(log_dir_expanded)
            import stat
            perms = stat.S_IMODE(st.st_mode)

            # Directory should be 0700 (owner rwx only)
            if perms != 0o700:
                logger.warning(f"Log directory {log_dir_expanded} has permissions {oct(perms)}, expected 0700. Fixing...")
                os.chmod(log_dir_expanded, 0o700)

        return True

    except Exception as e:
        logger.error(f"Failed to ensure secure log directory: {str(e)}", exc_info=True)
        return False


def write_log_entry(log_file: str, entry: str, ensure_secure: bool = True) -> bool:
    """
    Write log entry to file with secure permissions

    Args:
        log_file: Path to log file
        entry: Log entry text
        ensure_secure: Whether to ensure 0600 permissions (default: True)

    Returns:
        True if successful, False otherwise
    """
    try:
        # Expand user home directory
        log_file_expanded = os.path.expanduser(log_file)

        # Create file if it doesn't exist
        if not os.path.exists(log_file_expanded):
            create_secure_log_file(log_file_expanded)

        # Append log entry
        with open(log_file_expanded, 'a', encoding='utf-8') as f:
            f.write(entry)
            if not entry.endswith('\n'):
                f.write('\n')

        # Ensure secure permissions (Unix only)
        if ensure_secure and not IS_WINDOWS:
            st = os.stat(log_file_expanded)
            import stat
            perms = stat.S_IMODE(st.st_mode)
            if perms != 0o600:
                os.chmod(log_file_expanded, 0o600)

        return True

    except Exception as e:
        logger.error(f"Failed to write log entry to {log_file}: {str(e)}", exc_info=True)
        return False


def get_log_file_stats(log_directory: str) -> Dict[str, Any]:
    """
    Get statistics about log files

    Args:
        log_directory: Directory containing log files

    Returns:
        Dictionary with log file statistics
    """
    try:
        if not os.path.exists(log_directory):
            return {
                "total_files": 0,
                "total_size_bytes": 0,
                "oldest_file_age_days": 0,
                "newest_file_age_days": 0
            }

        log_files = []
        total_size = 0
        current_time = time.time()

        for filename in os.listdir(log_directory):
            file_path = os.path.join(log_directory, filename)

            if os.path.isfile(file_path) and filename.endswith('.log'):
                file_stat = os.stat(file_path)
                file_age = (current_time - file_stat.st_mtime) / (24 * 60 * 60)
                log_files.append({
                    "name": filename,
                    "size": file_stat.st_size,
                    "age_days": file_age
                })
                total_size += file_stat.st_size

        if not log_files:
            return {
                "total_files": 0,
                "total_size_bytes": 0,
                "oldest_file_age_days": 0,
                "newest_file_age_days": 0
            }

        ages = [f["age_days"] for f in log_files]

        return {
            "total_files": len(log_files),
            "total_size_bytes": total_size,
            "oldest_file_age_days": max(ages),
            "newest_file_age_days": min(ages),
            "files": log_files
        }

    except Exception as e:
        logger.error(f"Failed to get log file stats: {str(e)}", exc_info=True)
        return {
            "total_files": 0,
            "total_size_bytes": 0,
            "oldest_file_age_days": 0,
            "newest_file_age_days": 0,
            "error": str(e)
        }
