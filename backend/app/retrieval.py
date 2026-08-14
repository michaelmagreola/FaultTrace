"""Local embedding + retrieval (no AWS required). Swap for Bedrock when AI_MODE=bedrock."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter

from sqlalchemy.orm import Session

from app.config import settings
from app.models import WorkOrder

TOKEN_RE = re.compile(r"[a-z0-9]+")

# Synonym / abbreviation map so local mode demos the vocabulary problem
SYNONYMS = {
    "spndl": "spindle",
    "spndel": "spindle",
    "spin": "spindle",
    "drft": "drift",
    "wander": "drift",
    "axis": "axis",
    "vib": "vibration",
    "vibrate": "vibration",
    "vibration": "vibration",
    "overheat": "overheating",
    "overheating": "overheating",
    "hot": "overheating",
    "alarm": "fault",
    "estop": "e_stop",
    "e": "e_stop",
    "stop": "e_stop",
    "jam": "jam",
    "overload": "overload",
}


def tokenize(text: str) -> list[str]:
    raw = TOKEN_RE.findall(text.lower().replace("-", " ").replace("_", " "))
    out: list[str] = []
    for t in raw:
        if len(t) < 2 and t not in {"x", "z"}:
            continue
        out.append(SYNONYMS.get(t, t))
    return out


def _stable_bucket(token: str, dim: int) -> int:
    digest = hashlib.md5(token.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % dim


def embed_text(text: str) -> list[float]:
    """
    Stable hashing-trick bag-of-words vector (dim=256) for local demo.
    Uses MD5 buckets so embeddings survive process restarts (unlike builtin hash()).
    Replace with Bedrock Titan embeddings in production.
    """
    dim = 256
    vec = [0.0] * dim
    tokens = tokenize(text)
    if not tokens:
        return vec
    counts = Counter(tokens)
    for token, count in counts.items():
        idx = _stable_bucket(token, dim)
        vec[idx] += float(count)
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def jaccard_tokens(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def embedding_to_json(vec: list[float]) -> str:
    return json.dumps(vec)


def embedding_from_json(raw: str | None) -> list[float] | None:
    if not raw:
        return None
    return json.loads(raw)


def retrieve(
    db: Session,
    query: str,
    *,
    asset_code: str | None = None,
    top_k: int | None = None,
) -> list[tuple[WorkOrder, float]]:
    top_k = top_k or settings.retrieval_top_k
    q_tokens = tokenize(query)
    qvec = embed_text(query)

    q = db.query(WorkOrder)
    if asset_code:
        from app.models import Asset

        q = q.join(Asset).filter(Asset.code == asset_code)

    scored: list[tuple[WorkOrder, float]] = []
    for wo in q.all():
        blob = " ".join([wo.fault_code, wo.symptom, wo.cause, wo.fix, wo.parts_used or ""])
        vec = embedding_from_json(wo.embedding_json) or embed_text(blob)
        emb_score = cosine(qvec, vec)
        tok_score = jaccard_tokens(q_tokens, tokenize(blob))
        # Hybrid: embeddings + token overlap (helps short queries / fault codes)
        score = 0.65 * emb_score + 0.35 * tok_score
        scored.append((wo, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]
