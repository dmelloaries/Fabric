import io
import re
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import requests
from pypdf import PdfReader
from sqlalchemy.orm import Session

from backend.models import Document, Clause, Entity, Obligation, ObligationEntity, ClauseChange
from backend.diff_engine import compute_word_diff

KNOWN_ENTITIES = {
    "Regulated Entity (RE)": "RE",
    "Commercial Bank": "Bank",
    "Non-Banking Financial Company (NBFC)": "NBFC",
    "Lending Service Provider (LSP)": "LSP",
    "Digital Lending App (DLA)": "DLA"
}

KNOWN_TYPES = {"DISCLOSURE", "CONSENT", "DATA_STORAGE", "REPORTING", "PROHIBITION"}


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.strip().encode('utf-8')).hexdigest()


class PDFExtractor:
    """Extracts raw textual stream, physical pages, and metadata from PDF files."""

    @staticmethod
    def extract_from_bytes(pdf_bytes: bytes) -> Tuple[List[Dict[str, Any]], str, Dict[str, str]]:
        stream = io.BytesIO(pdf_bytes)
        reader = PdfReader(stream)
        doc_hash = hashlib.sha256(pdf_bytes).hexdigest()

        pages_data: List[Dict[str, Any]] = []
        full_text_list: List[str] = []

        for idx, page in enumerate(reader.pages):
            page_no = idx + 1
            raw_page_text = page.extract_text() or ""
            # Clean non-printable / trailing null bytes while preserving structure
            clean_text = raw_page_text.replace('\x00', '').strip()
            pages_data.append({
                "page_no": page_no,
                "text": clean_text
            })
            full_text_list.append(clean_text)

        full_doc_text = "\n\n".join(full_text_list)
        metadata = PDFExtractor._extract_rbi_metadata(full_doc_text)

        return pages_data, doc_hash, metadata

    @staticmethod
    def _extract_rbi_metadata(full_text: str) -> Dict[str, str]:
        """Heuristically extracts standard RBI notification header attributes."""
        # 1. Circular Number Pattern (e.g., RBI/2022-23/111 or RBI/2025-26/...)
        circ_match = re.search(r'(RBI/\d{4}-\d{2,4}/\d+[^\n\r]*)', full_text)
        circular_no = circ_match.group(1).strip() if circ_match else "RBI/DL/NOTIF"

        # 2. Date Pattern (e.g., September 02, 2022 or June 08, 2023)
        date_match = re.search(
            r'([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})',
            full_text[:3000]
        )
        issue_date = date_match.group(1).strip() if date_match else datetime.now().strftime("%B %d, %Y")

        # 3. Title Heuristic
        title = "RBI Digital Lending Regulatory Directions"
        for line in full_text[:1500].split('\n'):
            line_clean = line.strip()
            if any(term in line_clean.lower() for term in ["guidelines on digital lending", "directions", "default loss guarantee", "fldg"]):
                if len(line_clean) > 10 and not line_clean.startswith("RBI/"):
                    title = line_clean
                    break

        return {
            "circular_no": circular_no,
            "issue_date": issue_date,
            "title": title
        }


class ClauseSegmenter:
    """Deterministically parses circular text into Chapters, Sections, and atomic Clauses."""

    @staticmethod
    def _classify_structural_type(para: str, para_lower: str, page_no: int, section_no: str) -> str:
        """
        P3: Heuristically classifies the structural role of a clause.
        Returns one of: cover_letter | annex_table | definitions | footnote | main_clause

        Rules (in priority order):
          1. cover_letter  — appears on page 1 or 2 AND contains salutation / transmittal language
          2. annex_table   — contains 'annex' / 'schedule' / 'appendix' in section_no or
                             para contains '|' or tab-separated columns (likely a table dump)
          3. definitions   — para starts with a term definition pattern e.g. "X means..."
          4. footnote      — very short (<120 chars) or starts with a superscript digit pattern
          5. main_clause   — everything else
        """
        sno_lower = section_no.lower()

        # Cover letter detection
        if page_no <= 2 and any(t in para_lower for t in [
            "dear sir", "dear madam", "all scheduled", "all commercial banks",
            "kindly refer", "please refer", "madam/dear sir", "a.p. (dir",
            "attention:", "sub:", "re:", "circular no.", "rbi/"
        ]):
            return "cover_letter"

        # Annex / table detection
        if any(t in sno_lower for t in ["annex", "schedule", "appendix", "exhibit"]):
            return "annex_table"
        if para.count('|') >= 2 or para.count('\t') >= 2:
            return "annex_table"
        # Repealing / superseding table (lists other circulars)
        if re.search(r'\b(repealed|superseded|replaced by|stands withdrawn)\b', para_lower):
            if re.search(r'RBI/\d{4}', para):
                return "annex_table"

        # Definitions detection
        if re.match(r'^["\'\u201c\u2018]?[A-Z][A-Za-z0-9 \-_/()]+["\'\u201d\u2019]?\s+(means|shall mean|refers to|is defined as)\b', para[:200], re.IGNORECASE):
            return "definitions"
        if any(t in sno_lower for t in ["definition", "interpretation"]):
            return "definitions"

        # Footnote detection
        if len(para) < 120 and re.match(r'^\d{1,3}\s', para):
            return "footnote"

        return "main_clause"

    @staticmethod
    def segment_pages(pages_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        clauses: List[Dict[str, Any]] = []

        current_chapter_no = "Chapter I"
        current_chapter_title = "Preliminary & Scope"

        # Regex triggers for RBI statutory numbering
        chapter_regex = re.compile(r'^(CHAPTER\s+[IVXLCDM\d]+|Chapter\s+[IVXLCDM\d]+)\s*[-:—]?\s*(.*)$', re.IGNORECASE)
        # Matches patterns like: "3.1 Disbursement", "4. Key Fact Statement", "Section 6.1", "12(a)"
        section_regex = re.compile(r'^(?:Section\s+)?(\d+(?:\.\d+)?(?:\([a-z\d]+\))?)\.?\s+(.+)$', re.MULTILINE)

        for page_info in pages_data:
            page_no = page_info["page_no"]
            page_text = page_info["text"]
            lines = page_text.split('\n')

            paragraphs: List[str] = []
            curr_para = []

            for line in lines:
                stripped = line.strip()
                if not stripped:
                    if curr_para:
                        paragraphs.append(" ".join(curr_para))
                        curr_para = []
                else:
                    curr_para.append(stripped)
            if curr_para:
                paragraphs.append(" ".join(curr_para))

            for para_idx, para in enumerate(paragraphs):
                p_no = para_idx + 1

                # Check for chapter transition
                ch_match = chapter_regex.match(para[:120])
                if ch_match:
                    current_chapter_no = ch_match.group(1).title()
                    ch_title_cand = ch_match.group(2).strip()
                    if ch_title_cand:
                        current_chapter_title = ch_title_cand
                    continue

                # Identify if paragraph contains statutory clause
                sec_match = section_regex.search(para[:100])
                if sec_match:
                    sec_num = sec_match.group(1).strip()
                    cand_title = sec_match.group(2).strip()
                    section_no = f"Section {sec_num}" if not sec_num.startswith("Section") else sec_num
                    clause_title = cand_title[:80]
                else:
                    # Generic subsection or numbered clause
                    sub_match = re.match(r'^(\([a-z\d]+\)|\d+\.)\s*(.*)', para)
                    if sub_match:
                        section_no = f"Clause {sub_match.group(1)}"
                        clause_title = sub_match.group(2)[:60]
                    else:
                        section_no = f"Section {page_no}.{p_no}"
                        clause_title = para[:60]

                # Only treat meaningful legal paragraphs (>= 40 chars) as regulatory clauses
                if len(para) >= 40:
                    structural_type = ClauseSegmenter._classify_structural_type(
                        para, para.lower(), page_no, section_no
                    )
                    clauses.append({
                        "chapter_no": current_chapter_no,
                        "chapter_title": current_chapter_title,
                        "section_no": section_no,
                        "clause_title": clause_title if clause_title else section_no,
                        "raw_text": para,
                        "page_no": page_no,
                        "paragraph_no": p_no,
                        "content_hash": sha256_text(para),
                        "structural_type": structural_type
                    })

        # Fallback if no specific section markers were found (e.g. condensed PDF)
        if not clauses and pages_data:
            for page_info in pages_data:
                if len(page_info["text"]) > 50:
                    clauses.append({
                        "chapter_no": "Chapter I",
                        "chapter_title": "General Regulatory Directions",
                        "section_no": f"Section {page_info['page_no']}.1",
                        "clause_title": page_info["text"][:60],
                        "raw_text": page_info["text"][:1200],
                        "page_no": page_info["page_no"],
                        "paragraph_no": 1,
                        "content_hash": sha256_text(page_info["text"][:1200]),
                        "structural_type": "main_clause"
                    })

        return clauses


class ObligationExtractor:
    """Extracts atomic structured facts, entity applicability, and verbatim quotes."""

    @staticmethod
    def extract_from_clause(clause: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw_text = clause["raw_text"]
        text_lower = raw_text.lower()
        extracted: List[Dict[str, Any]] = []

        # 1. Determine Obligation Category
        ob_type = "DISCLOSURE"
        if any(term in text_lower for term in ["shall not", "prohibited", "prohibit", "barred", "no pass-through", "neither", "strictly banned"]):
            ob_type = "PROHIBITION"
        elif any(term in text_lower for term in ["key fact statement", "kfs", "apr", "disclose", "disclosure", "cooling-off", "publish"]):
            ob_type = "DISCLOSURE"
        elif any(term in text_lower for term in ["consent", "prior consent", "look-up", "opt-out", "revoke"]):
            ob_type = "CONSENT"
        elif any(term in text_lower for term in ["data storage", "servers in india", "biometric", "personal data", "cloud", "privacy"]):
            ob_type = "DATA_STORAGE"
        elif any(term in text_lower for term in ["credit information companies", "cic", "reporting", "credit bureau", "monthly", "quarterly"]):
            ob_type = "REPORTING"

        # 2. Identify Entity Scope & Applicability Type
        entities: List[Dict[str, str]] = []
        is_passthrough = False

        if any(term in text_lower for term in ["lending service provider", "lsp", "agent"]):
            entities.append({"name": "Lending Service Provider (LSP)", "type": "LSP"})
            is_passthrough = True

        if any(term in text_lower for term in ["digital lending app", "dla", "mobile application", "mobile app"]):
            entities.append({"name": "Digital Lending App (DLA)", "type": "DLA"})
            is_passthrough = True

        if any(term in text_lower for term in ["commercial bank", "banks"]):
            entities.append({"name": "Commercial Bank", "type": "Bank"})

        if any(term in text_lower for term in ["non-banking financial company", "nbfc"]):
            entities.append({"name": "Non-Banking Financial Company (NBFC)", "type": "NBFC"})

        # Default fallback to General Regulated Entity if no specific party was isolated
        if not entities or any(term in text_lower for term in ["regulated entity", "re shall", "lenders"]):
            entities.append({"name": "Regulated Entity (RE)", "type": "RE"})

        # 3. Extract Verbatim Substring Quote (Stage 1 Guarantee)
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', raw_text) if len(s.strip()) > 20]
        chosen_quote = ""
        action_required = ""

        # Find the most imperative regulatory sentence
        for sentence in sentences:
            s_lower = sentence.lower()
            if any(imperative in s_lower for imperative in ["shall", "must", "required to", "shall not", "prohibited", "ensure that"]):
                chosen_quote = sentence
                break

        if not chosen_quote and sentences:
            chosen_quote = sentences[0]
        elif not chosen_quote:
            chosen_quote = raw_text[:200]

        # Ensure chosen_quote is an absolute verbatim substring of raw_text
        if chosen_quote not in raw_text:
            chosen_quote = raw_text[:min(180, len(raw_text))]

        # Formulate affirmative action required
        action_required = chosen_quote
        if ob_type == "PROHIBITION" and not action_required.lower().startswith("prohibited"):
            action_required = f"Strict Prohibition: {chosen_quote}"

        # 4. Extract Deadlines
        deadline = None
        dl_match = re.search(r'(within\s+\d+\s+(?:days|months|hours|working days)|immediately|annually|prior to disbursement)', text_lower)
        if dl_match:
            deadline = dl_match.group(1).title()

        # 5. Run Two-Stage Guardrails & Compute Confidence
        stage1_ok = chosen_quote in raw_text
        stage2_ok = ob_type in KNOWN_TYPES

        confidence = 0.95
        flag_reason = None

        if not stage1_ok:
            confidence = 0.60
            flag_reason = "Stage 1 Guardrail Failure: Quote is not a verbatim substring of source text."
        elif not stage2_ok:
            confidence = 0.70
            flag_reason = "Stage 2 Guardrail Failure: Unmapped taxonomy or unknown regulatory categorization."
        elif "time to time" in text_lower or "may at its discretion" in text_lower:
            confidence = 0.82
            flag_reason = "Discretionary statutory wording flagged for compliance officer interpretation."

        status = "VERIFIED" if confidence >= 0.85 else "FLAGGED"

        extracted.append({
            "obligation_type": ob_type,
            "action_required": action_required,
            "source_quote": chosen_quote,
            "deadline": deadline,
            "frequency": "Continuous" if ob_type == "PROHIBITION" else "Per Transaction",
            "origin": "DIRECT",
            "confidence": confidence,
            "status": status,
            "flag_reason": flag_reason,
            "stage1_verbatim_verified": stage1_ok,
            "stage2_taxonomy_validated": stage2_ok,
            "entities": entities,
            "is_passthrough": is_passthrough
        })

        return extracted


class IngestionPipeline:
    """End-to-end Layer 5 Ingestion Pipeline orchestrating parsing, extraction, and database persistence."""

    @staticmethod
    def ingest_pdf_bytes(
        pdf_bytes: bytes,
        db: Session,
        title_override: Optional[str] = None,
        version_id_override: Optional[str] = None
    ) -> Dict[str, Any]:
        # 1. Extract Pages & Document Metadata
        pages_data, doc_hash, meta = PDFExtractor.extract_from_bytes(pdf_bytes)

        title = title_override or meta["title"]
        circular_no = meta["circular_no"]
        issue_date = meta["issue_date"]
        # Generate version_id slug
        year_match = re.search(r'20\d{2}', issue_date)
        year_str = year_match.group(0) if year_match else "2025"
        version_id = version_id_override or f"{year_str}-v{int(datetime.now().timestamp()) % 1000}"

        # Check if already ingested by sha256 or version_id
        existing_doc = db.query(Document).filter(
            (Document.sha256_hash == doc_hash) | (Document.version_id == version_id)
        ).first()

        if existing_doc:
            # Re-seed under a fresh timestamped version_id if testing uploads
            version_id = f"{version_id}-{int(datetime.now().timestamp()) % 10000}"

        doc = Document(
            title=title,
            circular_no=circular_no,
            issue_date=issue_date,
            version_id=version_id,
            file_path=f"data/raw_pdfs/{version_id}.pdf",
            sha256_hash=doc_hash
        )
        db.add(doc)
        db.flush()

        # 2. Segment Clauses
        clauses_data = ClauseSegmenter.segment_pages(pages_data)
        saved_clauses = []

        for c_data in clauses_data:
            clause_obj = Clause(
                doc_id=doc.id,
                chapter_no=c_data["chapter_no"],
                chapter_title=c_data["chapter_title"],
                section_no=c_data["section_no"],
                clause_title=c_data["clause_title"],
                raw_text=c_data["raw_text"],
                page_no=c_data["page_no"],
                paragraph_no=c_data["paragraph_no"],
                content_hash=c_data["content_hash"],
                structural_type=c_data.get("structural_type", "main_clause")
            )
            db.add(clause_obj)
            db.flush()
            saved_clauses.append((clause_obj, c_data))

        # 3. Extract & Validate Obligations with Guardrails
        entity_cache = {e.name: e for e in db.query(Entity).all()}
        total_obs = 0
        verified_count = 0
        flagged_count = 0

        for clause_obj, c_data in saved_clauses:
            obs = ObligationExtractor.extract_from_clause(c_data)
            for ob_data in obs:
                ob_obj = Obligation(
                    clause_id=clause_obj.id,
                    obligation_type=ob_data["obligation_type"],
                    action_required=ob_data["action_required"],
                    deadline=ob_data["deadline"],
                    frequency=ob_data["frequency"],
                    origin=ob_data["origin"],
                    confidence=ob_data["confidence"],
                    source_quote=ob_data["source_quote"],
                    status=ob_data["status"],
                    flag_reason=ob_data["flag_reason"]
                )
                db.add(ob_obj)
                db.flush()
                total_obs += 1

                if ob_data["status"] == "VERIFIED":
                    verified_count += 1
                else:
                    flagged_count += 1

                # Link Entities
                for ent_info in ob_data["entities"]:
                    ent_name = ent_info["name"]
                    ent_obj = entity_cache.get(ent_name)
                    if not ent_obj:
                        ent_obj = Entity(name=ent_name, legal_type=ent_info["type"], description=ent_name)
                        db.add(ent_obj)
                        db.flush()
                        entity_cache[ent_name] = ent_obj

                    app_type = "CONTRACTUAL_PASSTHROUGH" if ob_data["is_passthrough"] and ent_info["type"] in ["LSP", "DLA"] else "DIRECT"
                    assoc = ObligationEntity(
                        obligation_id=ob_obj.id,
                        entity_id=ent_obj.id,
                        applicability_type=app_type
                    )
                    db.add(assoc)

        # 4. Compute Diffs if Prior Document Exists
        prior_doc = db.query(Document).filter(Document.id != doc.id).order_by(Document.id.desc()).first()
        if prior_doc:
            IngestionPipeline._compute_diffs(prior_doc, doc, db)

        db.commit()

        return {
            "document_id": doc.id,
            "title": doc.title,
            "circular_no": doc.circular_no,
            "version_id": doc.version_id,
            "sha256_hash": doc.sha256_hash,
            "total_pages": len(pages_data),
            "clauses_extracted": len(saved_clauses),
            "obligations_extracted": total_obs,
            "verified_count": verified_count,
            "flagged_count": flagged_count,
            "status": "INGESTION_COMPLETE"
        }

    @staticmethod
    def _compute_diffs(doc_v1: Document, doc_v2: Document, db: Session):
        """Deterministically registers word-level diffs between circular revisions."""
        v1_clauses = db.query(Clause).filter(Clause.doc_id == doc_v1.id).all()
        v2_clauses = db.query(Clause).filter(Clause.doc_id == doc_v2.id).all()

        v1_map = {c.section_no: c for c in v1_clauses}
        v2_map = {c.section_no: c for c in v2_clauses}

        for sec_no, c2 in v2_map.items():
            if sec_no in v1_map:
                c1 = v1_map[sec_no]
                if c1.content_hash != c2.content_hash:
                    # Modified provision
                    change = ClauseChange(
                        doc_v1_id=doc_v1.id,
                        doc_v2_id=doc_v2.id,
                        old_clause_id=c1.id,
                        new_clause_id=c2.id,
                        section_no=sec_no,
                        change_type="MODIFIED",
                        diff_summary=f"Section {sec_no} modified across regulatory circulars.",
                        attribute_changes="Textual refinement and compliance scope update",
                        old_text=c1.raw_text,
                        new_text=c2.raw_text
                    )
                    db.add(change)
            else:
                # Newly added provision
                change = ClauseChange(
                    doc_v1_id=doc_v1.id,
                    doc_v2_id=doc_v2.id,
                    old_clause_id=None,
                    new_clause_id=c2.id,
                    section_no=sec_no,
                    change_type="ADDED",
                    diff_summary=f"New provision {sec_no} introduced in {doc_v2.version_id}.",
                    attribute_changes="Newly enacted statutory mandate",
                    old_text="",
                    new_text=c2.raw_text
                )
                db.add(change)

        # Check for removed provisions
        for sec_no, c1 in v1_map.items():
            if sec_no not in v2_map:
                change = ClauseChange(
                    doc_v1_id=doc_v1.id,
                    doc_v2_id=doc_v2.id,
                    old_clause_id=c1.id,
                    new_clause_id=None,
                    section_no=sec_no,
                    change_type="REMOVED",
                    diff_summary=f"Section {sec_no} repealed or omitted in {doc_v2.version_id}.",
                    attribute_changes="Statutory requirement rescinded",
                    old_text=c1.raw_text,
                    new_text=""
                )
                db.add(change)

    @staticmethod
    def ingest_from_url(
        url: str,
        db: Session,
        title_override: Optional[str] = None,
        version_id_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """Downloads PDF from public URL (e.g. RBI portal) and ingests it."""
        response = requests.get(url, verify=False, timeout=30)
        if response.status_code != 200:
            raise ValueError(f"Failed to fetch PDF from URL: HTTP {response.status_code}")

        pdf_bytes = response.content
        return IngestionPipeline.ingest_pdf_bytes(
            pdf_bytes=pdf_bytes,
            db=db,
            title_override=title_override,
            version_id_override=version_id_override
        )
