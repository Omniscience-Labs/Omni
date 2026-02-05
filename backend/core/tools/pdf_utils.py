"""
Shared PDF rasterization: convert PDF (path, URL, or bytes) to per-page PIL images.

Used by the PDF-to-image sandbox tool and the PDF form-filling tool.
PyMuPDF only; async API runs CPU-bound work in a thread pool.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union

from PIL import Image
import requests

# PyMuPDF; raise at import so callers know immediately if missing
try:
    import fitz  # type: ignore  # noqa: F401
except ImportError as e:
    raise ImportError(
        "PyMuPDF is required for PDF rasterization. Install with: pip install PyMuPDF"
    ) from e

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

DEFAULT_MAX_SIZE = 1600
"""Default long edge in pixels when resolution is driven by max_size."""

DEFAULT_DPI = 200
"""DPI used when only dpi is provided (no max_size)."""

DEFAULT_URL_MAX_BYTES = 50 * 1024 * 1024  # 50 MiB
"""Max size for PDF fetched from URL; reject larger to avoid OOM/abuse."""

DEFAULT_URL_TIMEOUT_SEC = 60.0
"""Timeout in seconds for HTTP request when fetching PDF from URL."""

ASSUMED_PAGE_WIDTH_IN = 8.5
"""Assumed page width in inches (US letter) for DPI derivation when only max_size is set."""

ASSUMED_PAGE_HEIGHT_IN = 11.0
"""Assumed page height in inches (US letter) for DPI derivation."""

MIN_DPI = 72
MAX_DPI = 600
"""Clamp effective DPI to this range."""


# -----------------------------------------------------------------------------
# Types
# -----------------------------------------------------------------------------


class PDFRasterizationError(Exception):
    """Raised when PDF rasterization fails (invalid PDF, password-protected, etc.)."""

    pass


@dataclass
class RasterizedPage:
    """One page rendered as an RGB image with dimensions for coordinate normalization."""

    page_index: int
    """0-based page number."""

    image: Image.Image
    """RGB PIL Image."""

    width_px: int
    """Image width in pixels (same as image.width)."""

    height_px: int
    """Image height in pixels (same as image.height)."""


# -----------------------------------------------------------------------------
# Resolve PDF bytes (URL, path, or raw bytes)
# -----------------------------------------------------------------------------


def _resolve_pdf_bytes(
    pdf_source: Union[str, bytes],
    *,
    url_max_bytes: int = DEFAULT_URL_MAX_BYTES,
    url_timeout_sec: float = DEFAULT_URL_TIMEOUT_SEC,
) -> bytes:
    """
    Resolve pdf_source (URL, local path, or raw bytes) to PDF bytes.

    Raises ValueError for invalid input (empty, not found, directory, URL too large).
    """
    if isinstance(pdf_source, bytes):
        if not pdf_source:
            raise ValueError("PDF source is empty")
        return pdf_source

    s = pdf_source.strip()
    if not s:
        raise ValueError("PDF source is empty")

    if s.startswith("http://") or s.startswith("https://"):
        try:
            resp = requests.get(
                s,
                stream=True,
                timeout=url_timeout_sec,
            )
            resp.raise_for_status()
        except requests.Timeout as e:
            raise ValueError(
                f"Failed to fetch PDF from URL: request timed out after {url_timeout_sec}s"
            ) from e
        except requests.RequestException as e:
            raise ValueError(f"Failed to fetch PDF from URL: {e!s}") from e

        content_length = resp.headers.get("Content-Length")
        if content_length is not None:
            try:
                cl = int(content_length)
                if cl > url_max_bytes:
                    raise ValueError(
                        f"PDF from URL exceeds maximum size ({url_max_bytes // (1024*1024)}MB)"
                    )
            except ValueError:
                pass

        chunks: list[bytes] = []
        total = 0
        for chunk in resp.iter_content(chunk_size=64 * 1024):
            if chunk:
                total += len(chunk)
                if total > url_max_bytes:
                    raise ValueError(
                        f"PDF from URL exceeds maximum size ({url_max_bytes // (1024*1024)}MB)"
                    )
                chunks.append(chunk)
        return b"".join(chunks)

    path = Path(s)
    if not path.exists():
        raise ValueError(f"PDF file not found: {path}")
    if path.is_dir():
        raise ValueError("Path is a directory, not a file")

    data = path.read_bytes()
    if not data:
        raise ValueError("PDF file is empty")
    return data


# -----------------------------------------------------------------------------
# Core rasterization (PyMuPDF)
# -----------------------------------------------------------------------------


def _rasterize_pdf_bytes_pymupdf(
    pdf_bytes: bytes,
    dpi: int,
    *,
    max_pages: Optional[int] = None,
) -> list[tuple[int, Image.Image]]:
    """
    Render PDF bytes to per-page RGB PIL images at the given DPI.

    Returns list of (page_index, PIL.Image) in order.
    Raises PDFRasterizationError on invalid/encrypted PDF or zero pages.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        msg = str(e).lower()
        if "password" in msg or "encrypted" in msg:
            raise PDFRasterizationError("PDF is password-protected") from e
        raise PDFRasterizationError(f"Invalid or corrupted PDF: {e!s}") from e

    try:
        if doc.page_count == 0:
            raise PDFRasterizationError("PDF has no pages")

        n_pages = doc.page_count
        if max_pages is not None and max_pages >= 1:
            n_pages = min(n_pages, max_pages)

        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        result: list[tuple[int, Image.Image]] = []

        for i in range(n_pages):
            page = doc[i]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes(
                "RGB",
                (pix.width, pix.height),
                pix.samples,
            )
            result.append((i, img))
        return result
    finally:
        doc.close()


# -----------------------------------------------------------------------------
# Effective DPI (max_size wins over dpi)
# -----------------------------------------------------------------------------


def _effective_dpi(
    max_size: Optional[int],
    dpi: Optional[int],
) -> int:
    """Compute DPI: when max_size is set, derive from assumed page size; else use dpi or DEFAULT_DPI."""
    if max_size is not None:
        long_edge_in = max(ASSUMED_PAGE_WIDTH_IN, ASSUMED_PAGE_HEIGHT_IN)
        effective = round(max_size / long_edge_in)
        return max(MIN_DPI, min(MAX_DPI, effective))
    return dpi if dpi is not None else DEFAULT_DPI


# -----------------------------------------------------------------------------
# Public sync API
# -----------------------------------------------------------------------------


def pdf_to_page_images(
    pdf_source: Union[str, bytes],
    *,
    max_size: Optional[int] = DEFAULT_MAX_SIZE,
    dpi: Optional[int] = None,
    max_pages: Optional[int] = None,
    url_max_bytes: int = DEFAULT_URL_MAX_BYTES,
    url_timeout_sec: float = DEFAULT_URL_TIMEOUT_SEC,
) -> list[RasterizedPage]:
    """
    Convert a PDF (path, URL, or bytes) to a list of per-page RGB images.

    When max_size is set, effective DPI is derived so the long edge of the
    assumed page (US letter) equals max_size; dpi is ignored. When max_size
    is None, dpi is used (default DEFAULT_DPI).

    Args:
        pdf_source: Local path, http(s) URL, or raw PDF bytes.
        max_size: Long edge in pixels (default 1600). When set, drives DPI; dpi ignored.
        dpi: Used only when max_size is None (default 200).
        max_pages: If set, only the first max_pages pages are rendered.
        url_max_bytes: Max size when fetching from URL (default 50 MiB).
        url_timeout_sec: Timeout for URL fetch (default 60s).

    Returns:
        List of RasterizedPage (page_index, image, width_px, height_px).

    Raises:
        ValueError: Empty source, file not found, URL too large/timeout.
        PDFRasterizationError: Invalid/encrypted PDF or zero pages.
    """
    raw_bytes = _resolve_pdf_bytes(
        pdf_source,
        url_max_bytes=url_max_bytes,
        url_timeout_sec=url_timeout_sec,
    )
    dpi_effective = _effective_dpi(max_size, dpi)
    pairs = _rasterize_pdf_bytes_pymupdf(raw_bytes, dpi_effective, max_pages=max_pages)
    return [
        RasterizedPage(
            page_index=page_index,
            image=img,
            width_px=img.width,
            height_px=img.height,
        )
        for page_index, img in pairs
    ]


# -----------------------------------------------------------------------------
# Public async API
# -----------------------------------------------------------------------------


async def pdf_to_page_images_async(
    pdf_source: Union[str, bytes],
    *,
    max_size: Optional[int] = DEFAULT_MAX_SIZE,
    dpi: Optional[int] = None,
    max_pages: Optional[int] = None,
    url_max_bytes: int = DEFAULT_URL_MAX_BYTES,
    url_timeout_sec: float = DEFAULT_URL_TIMEOUT_SEC,
) -> list[RasterizedPage]:
    """
    Async wrapper for pdf_to_page_images; runs CPU-bound work in a thread.

    Same arguments and return type as pdf_to_page_images.
    """
    return await asyncio.to_thread(
        pdf_to_page_images,
        pdf_source,
        max_size=max_size,
        dpi=dpi,
        max_pages=max_pages,
        url_max_bytes=url_max_bytes,
        url_timeout_sec=url_timeout_sec,
    )
