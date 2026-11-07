"""Photo intake (prompt-v1 §7.12): validate, re-encode, strip EXIF from public copies, hash, measure.

The original is stored privately; a 1080 px public copy and a 320 px thumb are re-encoded JPEGs with
no EXIF. EXIF time and GPS are read from the original for the capture check (§7.11). The perceptual
hash catches re-used photos; green and bright-surface shares feed the rough content heuristic.
Public surfaces (avatars, posts, events, products) show only approved photos; with
MODERATION_PROVIDER=manual they wait in the moderator queue, with google_vision they are checked
first and anything flagged or any error still goes to the queue (fail closed).
"""

from __future__ import annotations

import base64
import io
import logging
import uuid
from datetime import UTC, datetime

import imagehash
import numpy as np
from PIL import Image, ImageOps
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..errors import AppError
from ..http import UpstreamError, fetch
from ..models import Photo
from ..storage import storage

log = logging.getLogger("atmos.photos")

MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
PUBLIC_PURPOSES = {"avatar", "post", "event", "product", "logo"}
# Excess-green index 2g − r − b (on 0–1 channels) above this marks a "green" pixel.
EXG_THRESHOLD = 0.10
BRIGHT_V, BRIGHT_MAX_SAT = 0.75, 0.25

try:  # HEIC support is optional
    from pillow_heif import register_heif_opener  # type: ignore

    register_heif_opener()
except Exception:  # pragma: no cover
    pass


def _gps(exif) -> tuple[float | None, float | None]:
    try:
        gps = exif.get_ifd(0x8825)
    except Exception:
        return None, None
    if not gps:
        return None, None

    def conv(v, ref) -> float | None:
        try:
            d, m, s = (float(x) for x in v)
            out = d + m / 60 + s / 3600
            return -out if ref in ("S", "W") else out
        except Exception:
            return None

    return conv(gps.get(2), gps.get(1)), conv(gps.get(4), gps.get(3))


def _exif_time(exif) -> datetime | None:
    try:
        sub = exif.get_ifd(0x8769)
        raw = sub.get(0x9003) or exif.get(0x0132)
        if not raw:
            return None
        # EXIF times have no zone; assume the camera's local time equals the claimed offset later.
        return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
    except Exception:
        return None


def measure(img: Image.Image) -> dict:
    small = img.convert("RGB").resize((128, 128))
    a = np.asarray(small, dtype=np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    exg = 2 * g - r - b
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return {
        "green_share": round(float((exg > EXG_THRESHOLD).mean()), 3),
        "bright_share": round(float(((mx >= BRIGHT_V) & (sat <= BRIGHT_MAX_SAT)).mean()), 3),
        "phash": str(imagehash.phash(img.convert("RGB"))),
    }


def _jpeg(img: Image.Image, max_side: int, quality: int = 82) -> bytes:
    im = img.convert("RGB")
    im.thumbnail((max_side, max_side))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=quality, optimize=True)  # no exif passed → stripped
    return out.getvalue()


def decode_data_url(data_url: str) -> tuple[bytes, str]:
    head, _, b64 = data_url.partition(",")
    mime = head.split(";")[0].removeprefix("data:") or "image/jpeg"
    return base64.b64decode(b64), mime


async def ingest(
    db: AsyncSession, owner_id: uuid.UUID, data: bytes, mime: str, purpose: str, *, private: bool | None = None
) -> Photo:
    if len(data) > MAX_BYTES:
        raise AppError(413, "photo.too_large", "Photos must be 8 MB or less")
    mime = (mime or "").lower()
    if mime not in ALLOWED:
        raise AppError(415, "photo.type", "Send a JPEG, PNG, WebP or HEIC photo")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise AppError(400, "photo.unreadable", "That file is not a readable photo")
    exif = img.getexif()
    lat, lng = _gps(exif)
    taken = _exif_time(exif)
    img = ImageOps.exif_transpose(img)
    m = measure(img)
    pid = uuid.uuid4()
    st = storage()
    day = datetime.now(UTC).strftime("%Y/%m")
    orig = st.save(f"orig/{day}/{pid}.jpg", _jpeg(img, 2400, 90))
    public = st.save(f"pub/{day}/{pid}.jpg", _jpeg(img, 1080))
    thumb = st.save(f"pub/{day}/{pid}_t.jpg", _jpeg(img, 320, 78))
    is_public = purpose in PUBLIC_PURPOSES
    p = Photo(
        id=pid,
        owner_id=owner_id,
        purpose=purpose,
        path_original=orig,
        path_public=public,
        path_thumb=thumb,
        mime="image/jpeg",
        width=img.width,
        height=img.height,
        phash=m["phash"],
        exif_time=taken.replace(tzinfo=UTC) if taken else None,
        exif_lat=lat,
        exif_lng=lng,
        green_share=m["green_share"],
        bright_share=m["bright_share"],
        # Private evidence photos are never shown publicly, so they need no public moderation.
        moderation="pending" if is_public else "approved",
        private=(not is_public) if private is None else private,
    )
    db.add(p)
    await db.flush()
    if is_public:
        await moderate(db, p, data)
    return p


async def moderate(db: AsyncSession, p: Photo, data: bytes) -> None:
    """google_vision: reject adult/violence ≥ LIKELY; any error stays in the queue (fail closed)."""
    if settings.moderation_provider != "google_vision" or not settings.google_vision_api_key:
        return
    body = {
        "requests": [
            {"image": {"content": base64.b64encode(data).decode()}, "features": [{"type": "SAFE_SEARCH_DETECTION"}]}
        ]
    }
    try:
        r = await fetch(
            "google_vision",
            "POST",
            "https://vision.googleapis.com/v1/images:annotate",
            params={"key": settings.google_vision_api_key},
            json=body,
            timeout=8,
        )
        ss = r.json()["responses"][0].get("safeSearchAnnotation") or {}
    except (UpstreamError, KeyError, IndexError, ValueError) as e:
        log.warning("vision check failed; photo stays in the queue", extra={"data": {"err": str(e)[:120]}})
        return
    bad = {"LIKELY", "VERY_LIKELY"}
    if ss.get("adult") in bad or ss.get("violence") in bad:
        p.moderation = "rejected"
        p.moderation_reason = "vision:" + ",".join(k for k in ("adult", "violence") if ss.get(k) in bad)
    else:
        p.moderation = "approved"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")
