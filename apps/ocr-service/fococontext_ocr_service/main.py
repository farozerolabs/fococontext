from __future__ import annotations

import asyncio
import base64
import os
from functools import lru_cache
from importlib import metadata
from threading import Lock
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return int(raw)


SERVICE_PORT = _env_int("OCR_SERVICE_PORT", 18082)
MAX_REQUEST_BYTES = _env_int("OCR_SERVICE_MAX_REQUEST_BYTES", 25 * 1024 * 1024)
DEFAULT_CONFIDENCE_THRESHOLD = float(os.getenv("OCR_CONFIDENCE_THRESHOLD", "0.5"))
REQUEST_TIMEOUT_SECONDS = _env_int("OCR_TIMEOUT_SECONDS", 60)
DEFAULT_LANGUAGES = [
    item.strip()
    for item in os.getenv("OCR_LANGS", "ch,en").split(",")
    if item.strip()
]
ENGINE_LOCK = Lock()


class OcrPageInput(BaseModel):
    page_number: int = Field(..., ge=1)
    image_base64: str = Field(..., min_length=1)
    mime_type: str = Field(default="image/png", min_length=1)


class OcrPagesRequest(BaseModel):
    pages: list[OcrPageInput] = Field(..., min_length=1)
    languages: list[str] = Field(default_factory=lambda: DEFAULT_LANGUAGES)
    confidence_threshold: float = Field(default=DEFAULT_CONFIDENCE_THRESHOLD, ge=0, le=1)


class OcrBlockResponse(BaseModel):
    text: str
    confidence: float | None = None
    bbox: list[list[float]] | None = None
    language: str | None = None


class OcrPageResponse(BaseModel):
    page_number: int
    blocks: list[OcrBlockResponse]


class OcrPagesResponse(BaseModel):
    provider: str
    engine: str
    model_version: str
    languages: list[str]
    pages: list[OcrPageResponse]


def _safe_version(package_name: str) -> str:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return "unknown"


def _release_value(name: str, fallback: str) -> str:
    value = os.getenv(name, "").strip()
    return value if value else fallback


def _release_metadata() -> dict[str, str]:
    return {
        "version": _release_value("FOCOCONTEXT_RELEASE_VERSION", "dev"),
        "revision": _release_value("FOCOCONTEXT_RELEASE_REVISION", "unknown"),
        "buildTime": _release_value("FOCOCONTEXT_RELEASE_BUILD_TIME", "unknown"),
        "source": _release_value("FOCOCONTEXT_RELEASE_SOURCE", "local"),
        "service": "ocr-service",
    }


@lru_cache(maxsize=1)
def _get_engine() -> Any:
    from rapidocr import RapidOCR

    return RapidOCR()


def _normalize_bbox(value: Any) -> list[list[float]] | None:
    if value is None:
        return None
    if hasattr(value, "tolist"):
        value = value.tolist()
    if not isinstance(value, list):
        return None
    normalized: list[list[float]] = []
    for point in value:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return None
        normalized.append([float(point[0]), float(point[1])])
    return normalized


def _normalize_sequence(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        return list(value)
    return []


def _normalize_blocks(result: Any, confidence_threshold: float) -> list[OcrBlockResponse]:
    boxes = _normalize_sequence(getattr(result, "boxes", None))
    texts = _normalize_sequence(getattr(result, "txts", None))
    scores = _normalize_sequence(getattr(result, "scores", None))
    language = getattr(result, "lang_rec", None)
    blocks: list[OcrBlockResponse] = []

    for index, text in enumerate(texts):
        if not isinstance(text, str) or text.strip() == "":
            continue
        score = scores[index] if index < len(scores) else None
        confidence = float(score) if isinstance(score, (int, float)) else None
        blocks.append(
            OcrBlockResponse(
                text=text,
                confidence=confidence,
                bbox=_normalize_bbox(boxes[index] if index < len(boxes) else None),
                language=language if isinstance(language, str) else None,
            )
        )

    if blocks:
        return blocks

    raw_items = result if isinstance(result, (list, tuple)) else []
    for item in raw_items:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        bbox = item[0]
        text = item[1]
        score = item[2] if len(item) > 2 else None
        if not isinstance(text, str) or text.strip() == "":
            continue
        confidence = float(score) if isinstance(score, (int, float)) else None
        blocks.append(
            OcrBlockResponse(
                text=text,
                confidence=confidence,
                bbox=_normalize_bbox(bbox),
                language=language if isinstance(language, str) else None,
            )
        )

    return blocks


def _recognize_page(page: OcrPageInput, confidence_threshold: float) -> OcrPageResponse:
    if not page.mime_type.startswith("image/"):
        raise HTTPException(status_code=400, detail={"code": "invalid_mime_type"})
    try:
        image_bytes = base64.b64decode(page.image_base64, validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_image_base64"}) from exc
    with ENGINE_LOCK:
        result = _get_engine()(image_bytes, text_score=confidence_threshold)
    return OcrPageResponse(
        page_number=page.page_number,
        blocks=_normalize_blocks(result, confidence_threshold),
    )


async def _check_auth(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("OCR_SERVICE_API_KEY", "")
    if expected == "":
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})


app = FastAPI(title="FocoContext OCR Service", version="0.1.0")


@app.middleware("http")
async def enforce_payload_size(request: Request, call_next: Any) -> Any:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            content_length_bytes = int(content_length)
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": {"code": "invalid_content_length"}})
        if content_length_bytes > MAX_REQUEST_BYTES:
            return JSONResponse(status_code=413, content={"detail": {"code": "payload_too_large"}})
    return await call_next(request)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ready",
        "provider": "rapidocr",
        "engine": "onnxruntime",
        "model_version": "PP-OCRv4",
        "languages": DEFAULT_LANGUAGES,
        "service_port": SERVICE_PORT,
        "max_request_bytes": MAX_REQUEST_BYTES,
        "timeout_seconds": REQUEST_TIMEOUT_SECONDS,
        "rapidocr_version": _safe_version("rapidocr"),
        "onnxruntime_version": _safe_version("onnxruntime"),
        "engine_loaded": _get_engine.cache_info().currsize > 0,
        "release": _release_metadata(),
    }


@app.post("/v1/ocr/pages")
async def recognize_pages(
    payload: OcrPagesRequest,
    _: None = Depends(_check_auth),
) -> OcrPagesResponse:
    pages: list[OcrPageResponse] = []

    for page in payload.pages:
        try:
            pages.append(
                await asyncio.wait_for(
                    asyncio.to_thread(_recognize_page, page, payload.confidence_threshold),
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
            )
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail={"code": "ocr_timeout"}) from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail={"code": "ocr_failed"}) from exc

    return OcrPagesResponse(
        provider="rapidocr",
        engine="onnxruntime",
        model_version="PP-OCRv4",
        languages=payload.languages,
        pages=pages,
    )
