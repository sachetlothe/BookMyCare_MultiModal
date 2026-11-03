"""Text extraction for uploaded reports (PDF text layer, OCR, plain text) and
basic, non-diagnostic quality features for medical images."""
from __future__ import annotations

import io
import logging
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError

from app.core.config import get_settings

log = logging.getLogger(__name__)

PDF_TYPES = {"application/pdf"}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp", "image/tiff"}
TEXT_TYPES = {"text/plain", "text/csv"}
ALLOWED_TYPES = PDF_TYPES | IMAGE_TYPES | TEXT_TYPES

EXT_TO_TYPE = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff",
    ".txt": "text/plain", ".csv": "text/csv",
}

MAX_OCR_PAGES = 10


@dataclass
class ExtractionResult:
    status: str  # done / partial / failed / skipped
    method: str | None
    text: str = ""
    error: str | None = None
    image_features: dict | None = None
    warnings: list[str] = field(default_factory=list)


def detect_content_type(filename: str, declared: str | None, head: bytes) -> str | None:
    """Determine the real file type from magic bytes, falling back to extension."""
    if head.startswith(b"%PDF"):
        return "application/pdf"
    if head.startswith(b"\x89PNG"):
        return "image/png"
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[:2] == b"BM":
        return "image/bmp"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    ext = Path(filename).suffix.lower()
    guessed = EXT_TO_TYPE.get(ext)
    if guessed in TEXT_TYPES:
        try:
            head.decode("utf-8")
            return guessed
        except UnicodeDecodeError:
            return None
    return None


def tesseract_available() -> bool:
    s = get_settings()
    try:
        import pytesseract

        if s.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = s.tesseract_cmd
            return Path(s.tesseract_cmd).exists()
        return shutil.which("tesseract") is not None
    except Exception:  # pragma: no cover
        return False


def _ocr_image(img: Image.Image) -> str:
    import pytesseract

    s = get_settings()
    if s.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = s.tesseract_cmd
    gray = ImageOps.grayscale(img)
    if max(gray.size) < 1500:  # upscale small images for better OCR
        factor = 1500 / max(gray.size)
        gray = gray.resize((int(gray.width * factor), int(gray.height * factor)))
    return pytesseract.image_to_string(gray)


def _extract_pdf(data: bytes) -> ExtractionResult:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [p.extract_text() or "" for p in reader.pages]
    except Exception as exc:
        return ExtractionResult("failed", "pdf_text", error=f"Could not read PDF: {exc}")
    text = "\n".join(pages).strip()
    if len(text) >= 20 * max(1, len(pages)) or len(text) > 200:
        return ExtractionResult("done", "pdf_text", text=text)

    # Probably a scanned PDF: render pages and OCR them.
    if not tesseract_available():
        return ExtractionResult(
            "partial" if text else "skipped", "pdf_text", text=text,
            error="PDF has little or no embedded text and Tesseract OCR is not installed; install it to read scanned PDFs.",
        )
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        ocr_parts = []
        for i in range(min(len(pdf), MAX_OCR_PAGES)):
            pil = pdf[i].render(scale=2).to_pil()
            ocr_parts.append(_ocr_image(pil))
        ocr_text = "\n".join(ocr_parts).strip()
        res = ExtractionResult("done" if ocr_text else "failed", "ocr", text=ocr_text or text)
        if len(pdf) > MAX_OCR_PAGES:
            res.status = "partial"
            res.error = f"Only the first {MAX_OCR_PAGES} pages were OCR'd."
        if not ocr_text:
            res.error = "OCR found no readable text."
        return res
    except Exception as exc:
        log.exception("PDF OCR failed")
        return ExtractionResult("partial" if text else "failed", "ocr", text=text, error=f"OCR failed: {exc}")


def _extract_image_text(data: bytes) -> ExtractionResult:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Image.DecompressionBombError:
        return ExtractionResult("failed", "ocr", error="Image is too large to process safely (too many pixels).")
    except (UnidentifiedImageError, OSError) as exc:
        return ExtractionResult("failed", "ocr", error=f"Unreadable image: {exc}")
    if not tesseract_available():
        return ExtractionResult(
            "skipped", "ocr",
            error="Tesseract OCR is not installed, so text could not be read from this image. Upload a PDF or text file, or install Tesseract.",
        )
    try:
        text = _ocr_image(img).strip()
    except Exception as exc:
        return ExtractionResult("failed", "ocr", error=f"OCR failed: {exc}")
    return ExtractionResult("done" if text else "failed", "ocr", text=text, error=None if text else "OCR found no readable text.")


def image_quality_features(data: bytes) -> dict:
    """Simple, explainable image statistics. These describe image *quality*,
    not medical findings."""
    img = Image.open(io.BytesIO(data))
    width, height = img.size  # from the header: the true image size
    mode, fmt = img.mode, img.format
    # Statistics are computed on a copy no larger than 1024 px, so a large X-ray does not
    # need several full-resolution RGB/greyscale copies in memory. JPEGs decode at reduced size.
    img.draft("RGB", (1024, 1024))
    img.load()
    img.thumbnail((1024, 1024))
    rgb = img.convert("RGB")
    gray = ImageOps.grayscale(img)
    stat = ImageStat.Stat(gray)
    brightness = stat.mean[0]
    contrast = stat.stddev[0]
    r, g, b = ImageStat.Stat(rgb).mean
    colorfulness = (abs(r - g) + abs(g - b) + abs(r - b)) / 3
    small = gray.copy()
    small.thumbnail((512, 512))
    edges = small.filter(ImageFilter.FIND_EDGES)
    sharpness = ImageStat.Stat(edges).var[0]

    warnings = []
    if min(width, height) < 224:
        warnings.append("Low resolution image; details may be lost.")
    if brightness < 40:
        warnings.append("Image is very dark.")
    elif brightness > 220:
        warnings.append("Image is very bright / overexposed.")
    if contrast < 20:
        warnings.append("Low contrast image.")
    if sharpness < 30:
        warnings.append("Image may be blurry.")

    return {
        "width": width,
        "height": height,
        "mode": mode,
        "format": fmt,
        "is_grayscale": colorfulness < 6,
        "mean_brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "sharpness": round(sharpness, 1),
        "quality_warnings": warnings,
        "quality_ok": not warnings,
    }


def extract(data: bytes, content_type: str, kind: str) -> ExtractionResult:
    if kind == "image":
        try:
            feats = image_quality_features(data)
        except Image.DecompressionBombError:
            return ExtractionResult("failed", "image_meta", error="Image is too large to process safely (too many pixels).")
        except (UnidentifiedImageError, OSError) as exc:
            return ExtractionResult("failed", "image_meta", error=f"Unreadable image: {exc}")
        return ExtractionResult("done", "image_meta", image_features=feats)
    if content_type in PDF_TYPES:
        return _extract_pdf(data)
    if content_type in IMAGE_TYPES:
        return _extract_image_text(data)
    if content_type in TEXT_TYPES:
        return ExtractionResult("done", "plain_text", text=data.decode("utf-8", errors="replace").strip())
    return ExtractionResult("failed", None, error=f"Unsupported content type {content_type}")
