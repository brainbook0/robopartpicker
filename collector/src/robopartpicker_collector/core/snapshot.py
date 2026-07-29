from __future__ import annotations

import hashlib
from typing import Any, Literal

from .redaction import redact


def build_retained_registration(
    *,
    external_registration_id: str,
    source_id: str,
    source_policy_revision_id: str,
    source_class: Literal["official", "reported", "measured", "calculated", "estimated", "ai_inferred"],
    evidence_class: Literal["structured_text", "document", "image", "archive_or_cad"],
    source_url: str,
    retrieved_at: str,
    applicable_revision: str,
    media_type: str,
    content: bytes,
    copyright_reuse_status: str,
    retrieval_metadata: dict[str, Any],
    trace_id: str | None,
) -> dict[str, Any]:
    return {
        "schemaVersion": "1.0",
        "externalRegistrationId": external_registration_id,
        "mode": "retained_bytes",
        "sourceId": source_id,
        "sourcePolicyRevisionId": source_policy_revision_id,
        "sourceClass": source_class,
        "evidenceClass": evidence_class,
        "sourceUrl": source_url,
        "retrievedAt": retrieved_at,
        "applicableRevision": applicable_revision,
        "declaredMediaType": media_type,
        "detectedMediaType": media_type,
        "byteSize": len(content),
        "contentSha256": hashlib.sha256(content).hexdigest(),
        "retrievalMetadata": redact(retrieval_metadata),
        "copyrightReuseStatus": copyright_reuse_status,
        "traceId": trace_id,
    }
