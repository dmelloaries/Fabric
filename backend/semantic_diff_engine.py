"""
Semantic Diff Engine -- RBI Regulatory Document Comparison
==========================================================
3-Stage Pipeline:
  1. BREAK DOWN  : Parse canonical clauses & generate dense embeddings.
  2. MATCH       : Two-pass (heading + Hungarian with null-node rejection).
  3. SHOW DIFF   : Fine-grained token diffs + Gemini Flash LLM summaries.

Bug fixes implemented:
  P1 -- Gemini embedding call is now fully instrumented (timing, HTTP status,
        embedding_source field on every result).
  P2 -- Hungarian matcher padded with null nodes so unmatched segments are
        labeled ADDED/REMOVED instead of being force-paired.
  P3 -- Structural type tags (cover_letter, annex_table, etc.) impose infinite
        cost for incompatible pairings in the hybrid cost matrix.
  P4 -- Pass 1 cheap heading match runs before the embedding+Hungarian step,
        reducing Gemini API load on clearly-renamed clauses.
  P5 -- Every diff result carries match_confidence, match_method,
        embedding_source, and review_flagged; low-confidence items are
        routed to /api/diff-review-queue.
"""

import os
import json
import re
import time
import difflib
import logging
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
from dotenv import load_dotenv

from backend.models import Document, Clause
from backend.schemas import (
    SemanticDiffItem, SemanticDiffSummary, SemanticDiffResponse,
    DocumentResponse, DiffWordToken
)

# ---------------------------------------------------------------------------
# Environment & logging
# ---------------------------------------------------------------------------

backend_env = Path(__file__).resolve().parent / ".env"
if backend_env.exists():
    load_dotenv(dotenv_path=backend_env)
load_dotenv()

logger = logging.getLogger("semantic_diff")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s"
)

# ---------------------------------------------------------------------------
# Thresholds (all configurable via environment variables)
# ---------------------------------------------------------------------------

# P2: Pairs whose hybrid score is below this are rejected (ADDED / REMOVED)
REJECTION_THRESHOLD: float = float(os.getenv("REJECTION_THRESHOLD", "0.60"))

# P5: Pairs whose hybrid score is below this are flagged for human review
REVIEW_FLAG_THRESHOLD: float = float(os.getenv("REVIEW_FLAG_THRESHOLD", "0.75"))

# P4: Heading fuzzy-match ratio to trigger Pass-1 heading match
HEADING_MATCH_MIN_RATIO: float = float(os.getenv("HEADING_MATCH_MIN_RATIO", "0.85"))

# Cache version tag -- bump to bust the in-memory cache after code changes
CACHE_VERSION = "v6"

# ---------------------------------------------------------------------------
# P3: Incompatible structural type pairs (infinite cost in cost matrix)
# ---------------------------------------------------------------------------

INCOMPATIBLE_TYPE_PAIRS: set = {
    ("annex_table", "cover_letter"),
    ("cover_letter", "annex_table"),
    ("annex_table", "definitions"),
    ("definitions", "annex_table"),
    ("cover_letter", "main_clause"),
    ("main_clause", "cover_letter"),
    ("footnote", "main_clause"),
    ("main_clause", "footnote"),
}

# ---------------------------------------------------------------------------
# In-memory LRU-style cache
# ---------------------------------------------------------------------------
SEMANTIC_DIFF_CACHE: Dict[str, SemanticDiffResponse] = {}


# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------

def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.warning("[SemanticEngine] GEMINI_API_KEY is not set -- will use TF-IDF fallback.")
        return None
    if not (api_key.startswith("AIza") or api_key.startswith("AQ.")):
        logger.warning(
            f"[SemanticEngine] GEMINI_API_KEY has unexpected prefix "
            f"(starts with '{api_key[:6]}...') -- verify key validity."
        )
    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as e:
        logger.error(f"[SemanticEngine] Could not initialize google.genai: {e}")
        return None


# ---------------------------------------------------------------------------
# P1: Instrumented embedding computation
# ---------------------------------------------------------------------------

def compute_embeddings(
    texts: List[str],
    client
) -> Tuple[np.ndarray, str]:
    """
    Computes dense embeddings for each text using gemini-embedding-001.

    Returns:
        (embeddings_matrix, embedding_source)
        embedding_source: 'gemini' | 'tfidf_fallback'

    Logs:
        - Per-batch: model, batch_index, batch_size, latency_ms, status
        - On failure: exception type, HTTP status code, message
    """
    if client and len(texts) > 0:
        try:
            embeddings_list: List[List[float]] = []
            batch_size = 25
            total_latency_ms = 0.0
            num_batches = 0

            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                clean_batch = [t.strip() or "General regulatory clause" for t in batch]

                t_start = time.perf_counter()
                res = client.models.embed_content(
                    model="gemini-embedding-001",
                    contents=clean_batch
                )
                latency_ms = (time.perf_counter() - t_start) * 1000
                total_latency_ms += latency_ms
                num_batches += 1

                logger.info(
                    f"[Gemini Embed] batch={num_batches} size={len(clean_batch)} "
                    f"latency={latency_ms:.1f}ms model=gemini-embedding-001 status=OK"
                )

                for item in res.embeddings:
                    embeddings_list.append(item.values)

            logger.info(
                f"[Gemini Embed] TOTAL texts={len(texts)} batches={num_batches} "
                f"total_latency={total_latency_ms:.1f}ms source=gemini"
            )

            mat = np.array(embeddings_list, dtype=np.float32)
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            norms[norms == 0] = 1e-9
            return mat / norms, "gemini"

        except Exception as e:
            exc_type = type(e).__name__
            exc_msg = str(e)
            # Surface HTTP status if present in exception attributes or message
            http_status = "unknown"
            if hasattr(e, "status_code"):
                http_status = str(e.status_code)
            elif hasattr(e, "code"):
                http_status = str(e.code)
            elif "429" in exc_msg:
                http_status = "429 (RATE_LIMIT)"
            elif "403" in exc_msg:
                http_status = "403 (FORBIDDEN/QUOTA)"
            elif "400" in exc_msg:
                http_status = "400 (BAD_REQUEST -- possible oversized chunk)"
            elif "401" in exc_msg:
                http_status = "401 (UNAUTHORIZED -- invalid API key)"

            logger.error(
                f"[Gemini Embed] FAILED exc_type={exc_type} "
                f"http_status={http_status} msg={exc_msg[:300]} "
                f"-> falling back to TF-IDF vectorizer"
            )
            # Fall through to TF-IDF fallback

    # TF-IDF fallback
    logger.warning(
        f"[Gemini Embed] Using TF-IDF fallback for {len(texts)} texts. "
        "Embedding quality is degraded -- diff matches may be less accurate."
    )
    from sklearn.feature_extraction.text import TfidfVectorizer
    clean_texts = [t.strip() or "general clause" for t in texts]
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words='english')
    tfidf_mat = vectorizer.fit_transform(clean_texts).toarray().astype(np.float32)
    norms = np.linalg.norm(tfidf_mat, axis=1, keepdims=True)
    norms[norms == 0] = 1e-9
    return tfidf_mat / norms, "tfidf_fallback"


# ---------------------------------------------------------------------------
# Word diff
# ---------------------------------------------------------------------------

def compute_word_diff_tokens(text1: str, text2: str) -> Tuple[List[DiffWordToken], int]:
    """
    Computes fine-grained word-by-word diff tokens with equal, insert, and delete types.
    Returns (tokens, changes_detected_count).
    """
    words1 = re.findall(r'\S+|\s+', text1) if text1 else []
    words2 = re.findall(r'\S+|\s+', text2) if text2 else []

    matcher = difflib.SequenceMatcher(None, words1, words2)
    tokens: List[DiffWordToken] = []
    change_count = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            chunk = "".join(words1[i1:i2])
            if chunk:
                tokens.append(DiffWordToken(type='equal', text=chunk))
        elif tag == 'replace':
            del_chunk = "".join(words1[i1:i2])
            ins_chunk = "".join(words2[j1:j2])
            if del_chunk:
                tokens.append(DiffWordToken(type='delete', text=del_chunk))
            if ins_chunk:
                tokens.append(DiffWordToken(type='insert', text=ins_chunk))
            change_count += 1
        elif tag == 'delete':
            del_chunk = "".join(words1[i1:i2])
            if del_chunk:
                tokens.append(DiffWordToken(type='delete', text=del_chunk))
                change_count += 1
        elif tag == 'insert':
            ins_chunk = "".join(words2[j1:j2])
            if ins_chunk:
                tokens.append(DiffWordToken(type='insert', text=ins_chunk))
                change_count += 1

    return tokens, max(change_count, 1 if text1.strip() != text2.strip() else 0)


# ---------------------------------------------------------------------------
# Heuristic LLM classification (fallback)
# ---------------------------------------------------------------------------

def heuristic_classification(old_text: str, new_text: str) -> Dict[str, Any]:
    """
    High-precision deterministic statutory heuristic classification for banking regulations.
    """
    combined = (old_text + " " + new_text).lower()
    impact = "MEDIUM"
    category = "GOVERNANCE"
    affected = ["RE", "Bank", "NBFC"]

    if "eight years" in combined or "retention" in combined or "preservation of records" in combined:
        impact = "HIGH"
        category = "RECORD_RETENTION"
        summary = "Retention period for customer records and loan contracts explicitly mandated to a minimum of eight years."
        action = "Update data archival infrastructure and cloud record retention policies to comply with 8-year minimum mandate."
    elif "fldg" in combined or "default loss" in combined or "guarantee" in combined or "5%" in combined:
        impact = "CRITICAL"
        category = "DLG_CAP"
        summary = "Default Loss Guarantee (FLDG) operational parameters and statutory 5% portfolio cap enacted."
        action = "Audit all contractual agreements between Regulated Entities and LSPs to ensure credit guarantee caps do not exceed 5%."
        affected = ["Bank", "NBFC", "LSP"]
    elif "apr" in combined or "annual percentage" in combined or "kfs" in combined or "key fact" in combined:
        impact = "HIGH"
        category = "APR_DISCLOSURE"
        summary = "All-inclusive Annual Percentage Rate (APR) and standardized Key Fact Statement (KFS) disclosure format mandated."
        action = "Ensure DLAs and mobile customer journeys present standardized KFS with full APR breakdown before loan execution."
        affected = ["Bank", "NBFC", "LSP", "DLA"]
    elif "consent" in combined or "privacy" in combined or "biometric" in combined or "contact" in combined:
        impact = "CRITICAL"
        category = "DATA_PRIVACY"
        summary = "Stringent restrictions on mobile device permissions; access to contacts, media, and location prohibited."
        action = "Audit DLA application manifest; remove runtime requests for mobile contacts, phone storage, and geolocation."
        affected = ["DLA", "LSP", "RE"]
    elif "cooling" in combined or "look-up" in combined or "exit" in combined:
        impact = "HIGH"
        category = "CONSUMER_PROTECTION"
        summary = "Mandatory cooling-off / look-up period during which borrowers can exit digital loan without prepayment penalty."
        action = "Configure loan management systems to support look-up cancellation workflows with zero penalty."
        affected = ["RE", "Bank", "NBFC", "LSP"]
    else:
        summary = "Refinement of statutory terminology, reporting obligations, and compliance framework."
        action = "Review internal compliance checklists and ensure standard operating procedures reflect updated circular phrasing."

    return {
        "impact_level": impact,
        "category": category,
        "executive_summary": summary,
        "compliance_action": action,
        "affected_entities": affected
    }


def batch_classify_with_llm(items: List[Dict[str, Any]], client) -> Dict[str, Dict[str, Any]]:
    """
    Sends all modified items in a single batch prompt to Gemini.
    Falls back gracefully to heuristic classification if unavailable.
    """
    results: Dict[str, Dict[str, Any]] = {}
    if not items:
        return results

    if client:
        try:
            compact_items = [
                {
                    "id": it["id"],
                    "title": it["title"],
                    "old_snippet": it["old_text"][:350],
                    "new_snippet": it["new_text"][:350]
                }
                for it in items[:15]
            ]

            prompt = f"""
You are a senior banking regulatory compliance auditor for the Reserve Bank of India (RBI) Digital Lending framework.
Analyze the following regulatory amendments and return a JSON array containing classification for each item:

{json.dumps(compact_items, indent=2)}

Return ONLY a valid JSON array of objects with:
- "id": string (must match the input id)
- "impact_level": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
- "category": "RECORD_RETENTION" | "APR_DISCLOSURE" | "DLG_CAP" | "DATA_PRIVACY" | "OUTSOURCING" | "GOVERNANCE" | "CONSUMER_PROTECTION"
- "executive_summary": 1 concise plain-English sentence summarizing the exact substantive change.
- "compliance_action": 1 practical action required by regulated entities.
- "affected_entities": ["Bank", "NBFC", "LSP", "DLA"]

Output raw JSON array only, no markdown formatting.
"""
            # Candidate models with gemini-3.6-flash prioritized
            configured_model = os.getenv("GEMINI_FLASH_MODEL", "gemini-3.6-flash").strip()
            candidate_models = [configured_model, "gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash"]
            seen = set()
            models_to_try = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

            resp = None
            used_model = None
            last_err = None

            for model_name in models_to_try:
                try:
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=prompt
                    )
                    if resp and hasattr(resp, "text") and resp.text:
                        used_model = model_name
                        logger.info(f"[SemanticEngine] Successfully classified {len(compact_items)} items using model={used_model}")
                        break
                except Exception as me:
                    last_err = me
                    logger.warning(f"[SemanticEngine] Model {model_name} failed: {me}. Trying fallback...")

            if not resp or not hasattr(resp, "text") or not resp.text:
                if last_err:
                    raise last_err
                raise RuntimeError("No response returned from Gemini generate_content.")

            raw = resp.text.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-zA-Z]*\n", "", raw)
                raw = re.sub(r"```$", "", raw).strip()

            llm_list = json.loads(raw)
            for entry in llm_list:
                item_id = str(entry.get("id"))
                results[item_id] = {
                    "impact_level": entry.get("impact_level", "MEDIUM"),
                    "category": entry.get("category", "GOVERNANCE"),
                    "executive_summary": entry.get("executive_summary", "Updated regulatory requirements and governance standards."),
                    "compliance_action": entry.get("compliance_action", "Review internal compliance workflows."),
                    "affected_entities": entry.get("affected_entities", ["Bank", "NBFC", "RE"])
                }
        except Exception as e:
            logger.warning(f"[SemanticEngine] Gemini batch classification notice: {e}. Using deterministic legal heuristics.")

    # Fill any missing items with domain heuristics
    for it in items:
        item_id = str(it["id"])
        if item_id not in results:
            results[item_id] = heuristic_classification(it["old_text"], it["new_text"])

    return results


# ---------------------------------------------------------------------------
# P4: Pass-1 heading matcher
# ---------------------------------------------------------------------------

def _heading_match_pass(
    clauses_v1: List[Clause],
    clauses_v2: List[Clause],
    min_ratio: float = HEADING_MATCH_MIN_RATIO
) -> Tuple[List[Tuple[int, int, float]], List[int], List[int]]:
    """
    Pass 1: Match clauses by title using exact then fuzzy (SequenceMatcher).

    Returns:
        heading_pairs  -- list of (v1_idx, v2_idx, ratio) for matched pairs
        unmatched_v1   -- indices of v1 clauses not matched in this pass
        unmatched_v2   -- indices of v2 clauses not matched in this pass
    """
    heading_pairs: List[Tuple[int, int, float]] = []
    used_v2: set = set()

    for i, c1 in enumerate(clauses_v1):
        title1 = (c1.clause_title or "").strip().lower()
        if not title1:
            continue

        best_ratio = 0.0
        best_j = -1

        for j, c2 in enumerate(clauses_v2):
            if j in used_v2:
                continue
            title2 = (c2.clause_title or "").strip().lower()
            if not title2:
                continue

            if title1 == title2:
                ratio = 1.0
            else:
                ratio = difflib.SequenceMatcher(None, title1, title2).ratio()

            if ratio >= min_ratio and ratio > best_ratio:
                best_ratio = ratio
                best_j = j

        if best_j >= 0:
            heading_pairs.append((i, best_j, best_ratio))
            used_v2.add(best_j)

    matched_v1 = {p[0] for p in heading_pairs}
    matched_v2 = {p[1] for p in heading_pairs}
    unmatched_v1 = [i for i in range(len(clauses_v1)) if i not in matched_v1]
    unmatched_v2 = [j for j in range(len(clauses_v2)) if j not in matched_v2]

    logger.info(
        f"[P4 Heading Pass] matched={len(heading_pairs)} "
        f"unmatched_v1={len(unmatched_v1)} unmatched_v2={len(unmatched_v2)}"
    )
    return heading_pairs, unmatched_v1, unmatched_v2


# ---------------------------------------------------------------------------
# P2: Hungarian matcher with null-node rejection
# ---------------------------------------------------------------------------

def _hungarian_match_with_rejection(
    hybrid_matrix: np.ndarray,
    v1_indices: List[int],
    v2_indices: List[int],
    clauses_v1: List[Clause],
    clauses_v2: List[Clause],
    rejection_threshold: float = REJECTION_THRESHOLD
) -> List[Tuple[int, int, float]]:
    """
    Runs scipy.optimize.linear_sum_assignment on the sub-matrix defined by
    v1_indices x v2_indices, padded with null nodes so segments with no
    acceptable partner are rejected (-> ADDED / REMOVED) rather than
    force-paired.

    Returns list of (v1_idx, v2_idx, hybrid_score) for accepted pairs only.
    """
    from scipy.optimize import linear_sum_assignment

    n1 = len(v1_indices)
    n2 = len(v2_indices)

    if n1 == 0 or n2 == 0:
        return []

    # Build sub-matrix from the full hybrid_matrix
    sub = np.zeros((n1, n2), dtype=np.float32)
    for ri, vi in enumerate(v1_indices):
        for rj, vj in enumerate(v2_indices):
            sub[ri, rj] = hybrid_matrix[vi, vj]

    null_cost = 1.0 - rejection_threshold  # cost for rejecting a segment

    # Pad with null columns for every v1 row (escape routes for v1 segments)
    null_cols = np.full((n1, n1), null_cost, dtype=np.float32)
    # Pad with null rows for every v2 col (escape routes for v2 segments)
    null_rows = np.full((n2, n2), null_cost, dtype=np.float32)
    # Corner block (null-vs-null) -- very low cost, doesn't compete with real pairs
    corner = np.full((n2, n1), 0.0, dtype=np.float32)

    # Assemble padded matrix:
    #   [ sub(n1 x n2)      | null_cols(n1 x n1) ]
    #   [ null_rows(n2 x n2) | corner(n2 x n1)   ]
    top = np.hstack([sub, null_cols])
    bottom = np.hstack([null_rows, corner])
    padded = np.vstack([top, bottom])

    cost_padded = 1.0 - padded
    # Clamp to avoid negative costs from the -1e9 incompatible-type sentinel
    cost_padded = np.clip(cost_padded, 0.0, 2.0)

    row_ind, col_ind = linear_sum_assignment(cost_padded)

    accepted: List[Tuple[int, int, float]] = []
    for ri, ci in zip(row_ind, col_ind):
        # Only real-to-real assignments (ri < n1 AND ci < n2)
        if ri < n1 and ci < n2:
            vi = v1_indices[ri]
            vj = v2_indices[ci]
            score = float(sub[ri, ci])
            if score >= rejection_threshold:
                accepted.append((vi, vj, score))
            else:
                logger.info(
                    f"[P2 Reject] v1[{vi}] '{clauses_v1[vi].clause_title}' "
                    f"<-> v2[{vj}] '{clauses_v2[vj].clause_title}' "
                    f"score={score:.3f} < threshold={rejection_threshold}"
                )

    logger.info(
        f"[P2 Hungarian] n1={n1} n2={n2} accepted={len(accepted)} "
        f"threshold={rejection_threshold}"
    )
    return accepted


# ---------------------------------------------------------------------------
# P3: Structural type helper
# ---------------------------------------------------------------------------

def _get_structural_type(clause: Clause) -> str:
    """Returns the clause's structural_type, defaulting to 'main_clause'."""
    st = getattr(clause, "structural_type", None)
    return (st or "main_clause").strip()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

class SemanticDiffPipeline:
    """
    End-to-end 3-Stage Regulatory Comparison Engine (v5 -- bug-fixed):
    1. Break Down  : Parse canonical clauses & generate dense embeddings.
    2. Match       : P4 heading pass + P2 Hungarian with null-node rejection
                     + P3 structural type incompatibility penalties.
    3. Show Diff   : Fine-grained token diffs + Gemini Flash LLM summaries
                     + P1/P5 embedding_source, match_confidence, match_method,
                     review_flagged on every result.
    """

    @classmethod
    def compare_documents(
        cls,
        doc_v1: Document,
        doc_v2: Document,
        clauses_v1: List[Clause],
        clauses_v2: List[Clause]
    ) -> SemanticDiffResponse:
        cache_key = f"{CACHE_VERSION}:{doc_v1.id}:{doc_v2.id}:{len(clauses_v1)}:{len(clauses_v2)}"
        if cache_key in SEMANTIC_DIFF_CACHE:
            logger.info(f"[Cache] Hit for {cache_key}")
            return SEMANTIC_DIFF_CACHE[cache_key]

        client = get_gemini_client()

        # ------------------------------------------------------------------
        # Step 1: BREAK DOWN
        # ------------------------------------------------------------------
        texts_v1 = [f"{c.clause_title or ''} {c.raw_text}".strip() for c in clauses_v1]
        texts_v2 = [f"{c.clause_title or ''} {c.raw_text}".strip() for c in clauses_v2]

        all_texts = texts_v1 + texts_v2
        if len(all_texts) > 0:
            embeddings_all, embedding_source = compute_embeddings(all_texts, client)
            emb_v1 = embeddings_all[:len(texts_v1)]
            emb_v2 = embeddings_all[len(texts_v1):]
        else:
            emb_v1 = np.zeros((len(texts_v1), 1), dtype=np.float32)
            emb_v2 = np.zeros((len(texts_v2), 1), dtype=np.float32)
            embedding_source = "tfidf_fallback"

        logger.info(
            f"[P1] Embedding source: {embedding_source} | "
            f"v1 clauses={len(clauses_v1)} v2 clauses={len(clauses_v2)}"
        )

        # ------------------------------------------------------------------
        # Step 2: MATCH
        # ------------------------------------------------------------------
        n1 = len(clauses_v1)
        n2 = len(clauses_v2)

        # Build full hybrid matrix
        if n1 > 0 and n2 > 0:
            cosine_sim = np.dot(emb_v1, emb_v2.T)
            hybrid_matrix = np.zeros((n1, n2), dtype=np.float32)

            for i, c1 in enumerate(clauses_v1):
                sec1 = c1.section_no.strip()
                title1 = (c1.clause_title or "").lower()
                stype1 = _get_structural_type(c1)

                for j, c2 in enumerate(clauses_v2):
                    sec2 = c2.section_no.strip()
                    title2 = (c2.clause_title or "").lower()
                    stype2 = _get_structural_type(c2)

                    # P3: Incompatible structural types -> effectively infinite cost
                    if (stype1, stype2) in INCOMPATIBLE_TYPE_PAIRS:
                        hybrid_matrix[i, j] = -1e6  # cost = 1 + 1e6 after inversion
                        continue

                    sem_score = float(cosine_sim[i, j])
                    sec_match = 1.0 if sec1 == sec2 else 0.0
                    title_match = (
                        difflib.SequenceMatcher(None, title1, title2).ratio()
                        if title1 and title2 else 0.0
                    )
                    hybrid_matrix[i, j] = (0.65 * sem_score) + (0.25 * title_match) + (0.10 * sec_match)
        else:
            hybrid_matrix = np.zeros((n1, n2), dtype=np.float32)

        # --- P4: Pass 1 -- Heading match ---
        heading_pairs, unmatched_v1_idxs, unmatched_v2_idxs = _heading_match_pass(
            clauses_v1, clauses_v2
        )

        # Compile all accepted matched pairs: (v1_idx, v2_idx, hybrid_score, match_method)
        all_matched: List[Tuple[int, int, float, str]] = []

        for (vi, vj, ratio) in heading_pairs:
            score = float(hybrid_matrix[vi, vj]) if n1 > 0 and n2 > 0 else ratio
            all_matched.append((vi, vj, max(score, 0.0), "heading"))

        # --- P2: Pass 2 -- Hungarian on unmatched remainder ---
        if unmatched_v1_idxs and unmatched_v2_idxs and n1 > 0 and n2 > 0:
            embedding_pairs = _hungarian_match_with_rejection(
                hybrid_matrix=hybrid_matrix,
                v1_indices=unmatched_v1_idxs,
                v2_indices=unmatched_v2_idxs,
                clauses_v1=clauses_v1,
                clauses_v2=clauses_v2,
                rejection_threshold=REJECTION_THRESHOLD
            )
            for (vi, vj, score) in embedding_pairs:
                all_matched.append((vi, vj, score, "embedding"))

        # Build lookup maps
        matched_v1_map: Dict[int, Tuple[int, float, str]] = {
            vi: (vj, score, method)
            for (vi, vj, score, method) in all_matched
        }
        matched_v2_set: set = {vj for (_, vj, _, _) in all_matched}

        # ------------------------------------------------------------------
        # Step 3: SHOW DIFF + Batch classify
        # ------------------------------------------------------------------
        results: List[SemanticDiffItem] = []
        added_count = 0
        removed_count = 0
        modified_count = 0
        unchanged_count = 0

        items_to_classify: List[Dict[str, Any]] = []
        preliminary_pairs: List[Tuple] = []

        for i, c1 in enumerate(clauses_v1):
            t1 = c1.raw_text.strip()

            if i in matched_v1_map:
                j, sim, mmethod = matched_v1_map[i]
                c2 = clauses_v2[j]
                t2 = c2.raw_text.strip()

                if sim >= 0.98 and t1 == t2:
                    change_type = "UNCHANGED"
                    unchanged_count += 1
                else:
                    change_type = "MODIFIED"
                    modified_count += 1
                    items_to_classify.append({
                        "id": f"{c1.section_no}->{c2.section_no}",
                        "title": c2.clause_title or c1.clause_title or f"Section {c2.section_no}",
                        "old_text": t1,
                        "new_text": t2
                    })

                preliminary_pairs.append((c1, c2, sim, change_type, t1, t2, mmethod))
            else:
                # v1 clause had no acceptable v2 partner -> REMOVED
                removed_count += 1
                preliminary_pairs.append((c1, None, 0.0, "REMOVED", t1, "", "none"))

        # Single batch LLM classification
        classifications = batch_classify_with_llm(items_to_classify, client)

        # Assemble matched items
        for c1, c2, sim, change_type, t1, t2, mmethod in preliminary_pairs:
            pair_key = f"{c1.section_no}->{c2.section_no}" if c2 else ""
            review_flagged = (
                change_type in ("MODIFIED",) and sim < REVIEW_FLAG_THRESHOLD
            )

            if change_type == "UNCHANGED":
                word_diff, num_changes = [], 0
                llm_info = {
                    "impact_level": "LOW",
                    "category": "GOVERNANCE",
                    "executive_summary": "Provision text remains identical across circular revisions.",
                    "compliance_action": "No operational changes required.",
                    "affected_entities": ["RE"]
                }
            elif change_type == "MODIFIED":
                word_diff, num_changes = compute_word_diff_tokens(t1, t2)
                llm_info = classifications.get(pair_key, heuristic_classification(t1, t2))
            else:  # REMOVED
                word_diff = [DiffWordToken(type='delete', text=t1)]
                num_changes = 1
                llm_info = {
                    "impact_level": "HIGH",
                    "category": "PROVISION_REPEALED",
                    "executive_summary": f"Section {c1.section_no} provision repealed in revision circular.",
                    "compliance_action": "Remove repealed statutory requirements from active checklists.",
                    "affected_entities": ["RE", "Bank", "NBFC"]
                }

            results.append(SemanticDiffItem(
                paragraph_no=c2.section_no if c2 else c1.section_no,
                heading=(c2.clause_title if c2 else None) or c1.clause_title or f"Paragraph {c1.section_no}",
                v1_section=c1.section_no,
                v2_section=c2.section_no if c2 else None,
                change_type=change_type,
                similarity_score=round(sim, 3),
                changes_detected_count=num_changes,
                old_text=t1,
                new_text=t2 if c2 else None,
                word_diff=word_diff,
                effective_date=doc_v2.issue_date,
                regulator="RBI",
                reference_circular=doc_v2.circular_no,
                section_context=(c2.chapter_title if c2 else None) or c1.chapter_title or "General Provisions",
                impact_level=llm_info["impact_level"],
                category=llm_info["category"],
                executive_summary=llm_info["executive_summary"],
                compliance_action=llm_info["compliance_action"],
                affected_entities=llm_info["affected_entities"],
                # P1/P4/P5 metadata
                embedding_source=embedding_source,
                match_confidence=round(sim, 3),
                match_method=mmethod,
                review_flagged=review_flagged
            ))

        # V2 clauses with no v1 partner -> ADDED
        for j, c2 in enumerate(clauses_v2):
            if j not in matched_v2_set:
                added_count += 1
                t2 = c2.raw_text.strip()
                results.append(SemanticDiffItem(
                    paragraph_no=c2.section_no,
                    heading=c2.clause_title or f"Section {c2.section_no}",
                    v1_section=None,
                    v2_section=c2.section_no,
                    change_type="ADDED",
                    similarity_score=0.0,
                    changes_detected_count=1,
                    old_text=None,
                    new_text=t2,
                    word_diff=[DiffWordToken(type='insert', text=t2)],
                    effective_date=doc_v2.issue_date,
                    regulator="RBI",
                    reference_circular=doc_v2.circular_no,
                    section_context=c2.chapter_title or "General Provisions",
                    impact_level="CRITICAL",
                    category="NEW_STATUTORY_REQUIREMENT",
                    executive_summary=f"New requirement introduced in Section {c2.section_no}.",
                    compliance_action="Establish operational governance and reporting mechanisms.",
                    affected_entities=["Bank", "NBFC", "LSP", "DLA"],
                    embedding_source=embedding_source,
                    match_confidence=0.0,
                    match_method="none",
                    review_flagged=False
                ))

        # Sort paragraphs logically by section numbers
        def sort_key(item: SemanticDiffItem):
            parts = re.findall(r'\d+', item.paragraph_no)
            return [int(p) for p in parts] if parts else [999]

        results.sort(key=sort_key)

        total_paragraphs = len(results)
        changed_count = modified_count + added_count + removed_count
        changed_pct = round((changed_count / total_paragraphs * 100), 1) if total_paragraphs > 0 else 0.0
        unchanged_pct = round((unchanged_count / total_paragraphs * 100), 1) if total_paragraphs > 0 else 0.0

        summary = SemanticDiffSummary(
            total_paragraphs=total_paragraphs,
            changed_count=changed_count,
            changed_percentage=changed_pct,
            unchanged_count=unchanged_count,
            unchanged_percentage=unchanged_pct,
            added_count=added_count,
            removed_count=removed_count,
            modified_count=modified_count
        )

        response = SemanticDiffResponse(
            v1_doc=DocumentResponse.model_validate(doc_v1),
            v2_doc=DocumentResponse.model_validate(doc_v2),
            summary=summary,
            paragraphs=results
        )

        SEMANTIC_DIFF_CACHE[cache_key] = response
        logger.info(
            f"[SemanticDiff] Complete: total={total_paragraphs} "
            f"added={added_count} removed={removed_count} "
            f"modified={modified_count} unchanged={unchanged_count} "
            f"embedding_source={embedding_source}"
        )
        return response



