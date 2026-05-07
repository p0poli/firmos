"""Voyage AI embedding service.

Public surface
--------------
embed_text(text)              → list[float] | None
embed_batch(texts)            → list[list[float] | None]
search_similar(db, ...)       → list[dict]   (cosine similarity via pgvector)

Design notes
------------
- All network I/O uses httpx.AsyncClient so callers can be async FastAPI
  handlers or async context-assembler functions without blocking.
- search_similar uses a synchronous SQLAlchemy session (our ORM layer is
  sync); it can safely be awaited from async code — the SQL round-trip is
  fast and not a scalability concern at this usage level.
- If VOYAGE_API_KEY is absent, embed_* return None/[None, …] and log a
  debug message. search_similar returns [] when called with no embedding.
- The `<=>` pgvector operator measures cosine *distance* (0 = identical,
  2 = opposite). Similarity = 1 − distance; we filter similarity > threshold
  by re-expressing it as distance < (1 − threshold).
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

import httpx
import sqlalchemy as sa
from sqlalchemy.orm import Session as OrmSession

from config import settings

logger = logging.getLogger("uvicorn.error")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-3"
VOYAGE_DIMS = 1024
EMBED_TIMEOUT = 30.0  # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _vec_literal(embedding: list[float]) -> str:
    """Format a Python list as a PostgreSQL vector string: [0.1,0.2,…]"""
    return "[" + ",".join(repr(x) for x in embedding) + "]"


# ---------------------------------------------------------------------------
# Embedding functions
# ---------------------------------------------------------------------------


async def embed_text(text: str) -> Optional[list[float]]:
    """Embed a single string via Voyage AI.

    Returns the 1 024-dim vector or None on any error (key absent, timeout,
    API error). Callers should treat None as "no embedding available" and
    skip memory storage rather than raising.
    """
    if not settings.voyage_api_key:
        logger.debug("embed_text: VOYAGE_API_KEY not configured — skipping")
        return None

    results = await embed_batch([text])
    return results[0] if results else None


async def embed_batch(texts: list[str]) -> list[Optional[list[float]]]:
    """Embed multiple strings in a single Voyage AI batch call.

    Returns a list of the same length as `texts`. Individual entries are
    None if the API returned no embedding for that index.

    Voyage AI natively batches up to 128 inputs per request; for larger
    batches we chunk automatically in groups of 128.
    """
    if not settings.voyage_api_key:
        logger.debug("embed_batch: VOYAGE_API_KEY not configured — returning Nones")
        return [None] * len(texts)

    if not texts:
        return []

    BATCH_SIZE = 128
    all_embeddings: list[Optional[list[float]]] = []

    for start in range(0, len(texts), BATCH_SIZE):
        chunk = texts[start : start + BATCH_SIZE]
        chunk_result = await _call_voyage(chunk)
        all_embeddings.extend(chunk_result)

    return all_embeddings


async def _call_voyage(texts: list[str]) -> list[Optional[list[float]]]:
    """Single Voyage AI /embeddings call for a chunk of texts."""
    try:
        async with httpx.AsyncClient(timeout=EMBED_TIMEOUT) as client:
            response = await client.post(
                VOYAGE_EMBED_URL,
                headers={
                    "Authorization": f"Bearer {settings.voyage_api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": VOYAGE_MODEL, "input": texts},
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        logger.warning("Voyage AI embed timed out after %.0fs: %s", EMBED_TIMEOUT, exc)
        return [None] * len(texts)
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Voyage AI embed HTTP %s: %s",
            exc.response.status_code,
            exc.response.text[:200],
        )
        return [None] * len(texts)
    except httpx.HTTPError as exc:
        logger.warning("Voyage AI embed network error: %s", exc)
        return [None] * len(texts)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Voyage AI embed unexpected error: %s", exc)
        return [None] * len(texts)

    # Response shape: {"data": [{"index": 0, "embedding": [...]}, …]}
    items: list[dict] = data.get("data", [])
    embedding_map: dict[int, list[float]] = {
        item["index"]: item["embedding"] for item in items if "embedding" in item
    }
    return [embedding_map.get(i) for i in range(len(texts))]


# ---------------------------------------------------------------------------
# Similarity search
# ---------------------------------------------------------------------------

# Tables that are valid targets for search_similar.
_VALID_TABLES = {
    "memory_chunks": {
        "content_col": "content_anonymized",
        "filter_col": "firm_id",
        "filter_key": "firm_id",
        "extra_where": "AND is_active = true",
    },
    "personal_memory_chunks": {
        "content_col": "content",
        "filter_col": "user_id",
        "filter_key": "user_id",
        "extra_where": "",
    },
}


async def search_similar(
    db: OrmSession,
    query_embedding: list[float],
    table: str,
    user_id: Optional[UUID] = None,
    firm_id: Optional[UUID] = None,
    limit: int = 5,
    threshold: float = 0.7,
) -> list[dict]:
    """Return rows from `table` with cosine similarity > threshold.

    Uses pgvector's `<=>` (cosine distance) operator:
        similarity = 1 − distance
        filter:   distance < (1 − threshold)
        order:    distance ASC  (most similar first)

    Parameters
    ----------
    db              SQLAlchemy sync session (from route's Depends)
    query_embedding Already-computed Voyage AI embedding
    table           "memory_chunks" or "personal_memory_chunks"
    user_id         Required when table = "personal_memory_chunks"
    firm_id         Required when table = "memory_chunks"
    limit           Max rows to return (default 5)
    threshold       Min cosine similarity 0–1 (default 0.7)

    Returns list of dicts: {id, content, similarity}
    """
    if table not in _VALID_TABLES:
        logger.warning("search_similar: invalid table %r — ignoring", table)
        return []

    meta = _VALID_TABLES[table]
    content_col = meta["content_col"]
    filter_col = meta["filter_col"]
    extra_where = meta["extra_where"]
    filter_key = meta["filter_key"]

    # Resolve the filter value.
    if table == "memory_chunks":
        if firm_id is None:
            return []
        filter_val = str(firm_id)
    else:
        if user_id is None:
            return []
        filter_val = str(user_id)

    vec_str = _vec_literal(query_embedding)
    # Cosine distance threshold: similarity > T  ↔  distance < (1 − T)
    distance_limit = 1.0 - threshold

    sql = sa.text(
        f"""
        SELECT
            id,
            {content_col}                                        AS content,
            1 - (embedding <=> CAST(:vec AS vector({VOYAGE_DIMS}))) AS similarity
        FROM   {table}
        WHERE  {filter_col} = CAST(:{filter_key} AS uuid)
          AND  embedding <=> CAST(:vec AS vector({VOYAGE_DIMS})) < :distance_limit
          {extra_where}
        ORDER  BY embedding <=> CAST(:vec AS vector({VOYAGE_DIMS})) ASC
        LIMIT  :limit
        """
    )

    params: dict = {
        "vec": vec_str,
        filter_key: filter_val,
        "distance_limit": distance_limit,
        "limit": limit,
    }

    try:
        rows = db.execute(sql, params).fetchall()
    except Exception as exc:  # noqa: BLE001
        # Graceful fallback: if pgvector isn't set up yet (e.g. migration
        # hasn't run) or the query fails, return empty rather than 500.
        logger.warning("search_similar query failed on %s: %s", table, exc)
        return []

    return [
        {
            "id": str(row.id),
            "content": row.content,
            "similarity": float(row.similarity),
        }
        for row in rows
    ]
