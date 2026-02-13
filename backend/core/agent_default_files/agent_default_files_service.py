"""
Agent Default Files Service
"""

from pathlib import Path
from typing import List, Dict, Any, Tuple
from fastapi import UploadFile
from core.utils.logger import logger
from core.services.supabase import DBConnection
from core.agent_default_files.validator import UploadedFileValidator

AGENT_DEFAULT_FILES_BUCKET_NAME = "agent-default-files"
MAX_FILE_SIZE_BYTES = 524288000  # 500MB

class AgentDefaultFilesService:
    def __init__(self):
        self._db = DBConnection()

    def _file_path(self, account_id: str, agent_id: str, filename: str) -> str:
        return f"{account_id}/{agent_id}/{filename}"

    def _sanitize_filename(self, filename: str) -> str:
        """Get safe basename from upload filename."""
        if not filename or not filename.strip():
            raise ValueError("Filename is required")
        name = Path(filename).name
        is_valid, error = UploadedFileValidator.validate_filename(name)
        if not is_valid:
            raise ValueError(error or "Invalid filename")
        return UploadedFileValidator.sanitize_filename(name)

    async def list_default_files(self, agent_id: str) -> List[Dict[str, Any]]:
        client = await self._db.client
        result = (
            await client
                .table('agent_default_files')
                .select('id, name, size, mime_type, updated_at')
                .eq('agent_id', agent_id)
                .order('updated_at', desc=True)
                .execute()
        )
        return result.data or []

    async def delete_default_file(self, file_id: str, agent_id: str) -> bool:
        client = await self._db.client
        row = (
            await client
                .table("agent_default_files")
                .select("storage_path")
                .eq("id", file_id)
                .eq("agent_id", agent_id)
                .maybe_single()
                .execute()
        )
        if not row.data:
            return False
        result = (
            await client
                .table("agent_default_files")
                .delete()
                .eq("id", file_id)
                .eq("agent_id", agent_id)
                .execute()
        )
        if not result.data:
            return False
        try:
            await client.storage.from_(AGENT_DEFAULT_FILES_BUCKET_NAME).remove(
                [row.data["storage_path"]]
            )
        except Exception as e:
            logger.warning(f"Failed to remove file from storage: {e}")
        return True

    async def copy_files_for_agent_copy(
        self,
        source_agent_id: str,
        dest_agent_id: str,
        dest_account_id: str,
    ) -> Dict[str, Any]:
        """Copy all default files from source agent to dest agent. Returns copied count, failed count, and list of (id, name) tuples."""
        client = await self._db.client
        rows = (
            await client
                .table("agent_default_files")
                .select("name, storage_path, size, mime_type")
                .eq("agent_id", source_agent_id)
                .execute()
        )
        source_files = rows.data or []
        files: List[Tuple[str, str]] = []
        failed = 0

        for row in source_files:
            source_path = row["storage_path"]
            dest_path = self._file_path(dest_account_id, dest_agent_id, row["name"])
            try:
                await client.storage.from_(AGENT_DEFAULT_FILES_BUCKET_NAME).copy(
                    source_path, dest_path
                )
                result = await client.table("agent_default_files").insert({
                    "agent_id": dest_agent_id,
                    "account_id": dest_account_id,
                    "name": row["name"],
                    "storage_path": dest_path,
                    "size": row["size"],
                    "mime_type": row.get("mime_type"),
                    "uploaded_by": None,
                }).execute()
                if result.data:
                    files.append((result.data[0]["id"], row["name"]))
            except Exception as e:
                logger.warning(f"Copy failed for {row['name']}: {e}")
                failed += 1

        return {
            "copied": len(files),
            "failed": failed,
            "files": files,
        }

    async def upload_default_file(
        self,
        file: UploadFile,
        account_id: str,
        agent_id: str,
        user_id: str
    ) -> str:
        """Upload agent's default file to bucket and insert metadata. Returns the new file id.
        Replaces existing file if same agent_id and filename."""
        filename = self._sanitize_filename(file.filename)
        if file.size is not None:
            UploadedFileValidator.validate_filesize(file.size, MAX_FILE_SIZE_BYTES)

        file_content = await file.read()
        size = len(file_content)
        UploadedFileValidator.validate_filesize(size, MAX_FILE_SIZE_BYTES)

        storage_path = self._file_path(account_id=account_id, agent_id=agent_id, filename=filename)
        mime_type = file.content_type or "application/octet-stream"

        client = await self._db.client

        # Replace existing file with same name for this agent
        existing = (
            await client
                .table("agent_default_files")
                .select("id, storage_path")
                .eq("agent_id", agent_id)
                .eq("name", filename)
                .execute()
        )
        if existing.data:
            try:
                await client.storage.from_(AGENT_DEFAULT_FILES_BUCKET_NAME).remove(
                    [existing.data[0]["storage_path"]]
                )
            except Exception as e:
                logger.warning(f"Failed to remove old file from storage: {e}")
            await client.table("agent_default_files").delete().eq("id", existing.data[0]["id"]).execute()

        await client.storage.from_(AGENT_DEFAULT_FILES_BUCKET_NAME).upload(
            storage_path,
            file_content,
            {"content-type": mime_type},
        )

        try:
            result = await client.table("agent_default_files").insert({
                "agent_id": agent_id,
                "account_id": account_id,
                "name": filename,
                "storage_path": storage_path,
                "size": size,
                "mime_type": mime_type,
                "uploaded_by": user_id,
            }).execute()
            return result.data[0]["id"]
        except Exception:
            try:
                await client.storage.from_(AGENT_DEFAULT_FILES_BUCKET_NAME).remove([storage_path])
            except Exception as cleanup_err:
                logger.warning(f"Failed to clean up orphaned storage after insert error: {cleanup_err}")
            raise



