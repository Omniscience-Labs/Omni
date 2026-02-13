"""
Validation for agent default file uploads.
"""

import re
from typing import Tuple, Optional

ILLEGAL_CHARS = r'[<>:"/\\|?*\x00-\x1f]'
RESERVED_NAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
})
MAX_LENGTH = 200


class UploadedFileValidator:
    """Validation for account owner file uploads."""

    @classmethod
    def sanitize_filename(cls, name: str) -> str:
        """Sanitize filename: strip illegal chars, fix reserved names, length limit."""
        if not name or not name.strip():
            raise ValueError("Filename cannot be empty")

        name = name.strip()
        name = re.sub(ILLEGAL_CHARS, "", name)
        name = name.strip(". ")

        if not name:
            raise ValueError("Filename cannot be empty")

        base = name.split(".")[0].upper()
        if base in RESERVED_NAMES:
            name = f"_{name}"

        if len(name.encode("utf-8")) > MAX_LENGTH:
            name = name[:MAX_LENGTH]

        if not name:
            raise ValueError("Filename cannot be empty")

        return name

    @classmethod
    def validate_filename(cls, name: str) -> Tuple[bool, Optional[str]]:
        """Validate filename. Returns (is_valid, error_message)."""
        if not name or not name.strip():
            return False, "Filename cannot be empty"

        name = name.strip()

        if len(name) > 255:
            return False, "Filename is too long"

        if re.search(ILLEGAL_CHARS, name):
            return False, "Filename contains illegal characters"

        if name.startswith(".") or name.endswith(".") or name.startswith(" ") or name.endswith(" "):
            return False, "Filename cannot start or end with dots or spaces"

        base = name.split(".")[0].upper()
        if base in RESERVED_NAMES:
            return False, f"Filename '{base}' is reserved"

        return True, None

    @classmethod
    def validate_filesize(cls, filesize: int, maxsize: int) -> None:
        """Validate file size. Raises ValueError if invalid."""
        if filesize <= 0:
            raise ValueError("File cannot be empty")
        if filesize > maxsize:
            raise ValueError(f"File exceeds maximum size of {maxsize // (1024 * 1024)}MB")
