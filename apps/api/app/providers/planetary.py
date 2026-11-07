"""Microsoft Planetary Computer: STAC search and SAS tokens (prompt-v1 §5.2).

Read access for every dataset: parse the storage account and container from the asset href and
GET /api/sas/v1/token/<account>/<container>. Tokens are cached until expiry minus 5 minutes and
never logged. The collection-name route returned 403 on MODIS assets, so it is not used.
"""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime, timedelta

from ..http import fetch, get_json

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
PROVIDER = "planetary_computer"

_tokens: dict[tuple[str, str], tuple[str, datetime]] = {}
_lock = asyncio.Lock()
HREF = re.compile(r"^https://([a-z0-9]+)\.blob\.core\.windows\.net/([^/]+)/")


async def search(
    collections: list[str],
    bbox: list[float],
    datetime_range: str,
    *,
    query: dict | None = None,
    limit: int = 100,
    max_items: int = 200,
    timeout: float = 60,
    retries: int = 2,
) -> list[dict]:
    body: dict = {
        "collections": collections,
        "bbox": bbox,
        "datetime": datetime_range,
        "limit": min(limit, 100),
        "sortby": [{"field": "datetime", "direction": "desc"}],
    }
    if query:
        body["query"] = query
    items: list[dict] = []
    url = f"{STAC}/search"
    while True:
        r = await fetch(PROVIDER, "POST", url, json=body, timeout=timeout, retries=retries)
        page = r.json()
        items.extend(page.get("features", []))
        nxt = next((ln for ln in page.get("links", []) if ln.get("rel") == "next"), None)
        if not nxt or len(items) >= max_items:
            break
        url = nxt["href"]
        body = nxt.get("body") or body
    return items[:max_items]


def _account_container(href: str) -> tuple[str, str]:
    m = HREF.match(href)
    if not m:
        raise ValueError("not a Planetary Computer blob href")
    return m.group(1), m.group(2)


async def token_for(href: str, timeout: float = 30) -> str:
    key = _account_container(href)
    now = datetime.now(UTC)
    hit = _tokens.get(key)
    if hit and hit[1] - now > timedelta(minutes=5):
        return hit[0]
    async with _lock:
        hit = _tokens.get(key)
        if hit and hit[1] - now > timedelta(minutes=5):
            return hit[0]
        data = await get_json(PROVIDER, f"{SAS}/{key[0]}/{key[1]}", timeout=timeout, retries=2)
        exp = datetime.fromisoformat(data["msft:expiry"].replace("Z", "+00:00"))
        _tokens[key] = (data["token"], exp)
        return data["token"]


async def sign(href: str) -> str:
    return f"{href}?{await token_for(href)}"


def item_date(item: dict) -> str:
    return (item.get("properties", {}).get("datetime") or item.get("properties", {}).get("start_datetime") or "")[:10]
