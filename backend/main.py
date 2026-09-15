from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_

from backend.database import get_db, engine, Base, run_migrations
from backend.models import Document, Clause, Obligation, Entity, ObligationEntity, ClauseChange
from backend.schemas import (
    DocumentResponse, ObligationResponse, EntityResponse,
    TraceabilityResponse, DiffResponse, DiffItemResponse,
    HierarchyChapter, HierarchySection, HierarchyClause,
    ReviewQueueItem, ReviewActionRequest, IngestUrlRequest, IngestResponse,
    SemanticDiffResponse
)
from backend.diff_engine import compute_word_diff
from backend.semantic_diff_engine import SemanticDiffPipeline
from backend.ingestion_engine import IngestionPipeline

# Ensure database tables exist, then run additive migrations
Base.metadata.create_all(bind=engine)
run_migrations()

# Ensure standard regulatory entities taxonomy is initialized
def init_entities():
    try:
        with Session(engine) as session:
            count = session.query(Entity).count()
            if count == 0:
                for edata in [
                    {"name": "Regulated Entity (RE)", "legal_type": "RE", "description": "All Commercial Banks, Primary Urban Co-operative Banks, and Non-Banking Financial Companies (NBFCs)."},
                    {"name": "Commercial Bank", "legal_type": "Bank", "description": "Scheduled Commercial Banks licensed under Section 22 of Banking Regulation Act, 1949."},
                    {"name": "Non-Banking Financial Company (NBFC)", "legal_type": "NBFC", "description": "Non-banking financial institutions registered under Chapter III-B of RBI Act, 1934."},
                    {"name": "Lending Service Provider (LSP)", "legal_type": "LSP", "description": "An agent of a Regulated Entity who carries out one or more of lender's functions including customer acquisition, underwriting support, pricing, servicing, and recovery."},
                    {"name": "Digital Lending App (DLA)", "legal_type": "DLA", "description": "Mobile and web-based applications with user interface that facilitate digital lending services, operated by REs or by LSPs engaged by REs."},
                ]:
                    session.add(Entity(**edata))
                session.commit()
    except Exception as e:
        print(f"[Init] Entity taxonomy setup notice: {e}")

init_entities()

app = FastAPI(
    title="RegulatoryFabric API",
    description="Deterministic Regulatory Obligation & Change Explorer for RBI Digital Lending Guidelines",
    version="1.0.0"
)

# Enable CORS for Next.js / Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KNOWN_ENTITIES = {"Regulated Entity (RE)", "Commercial Bank", "Non-Banking Financial Company (NBFC)", "Lending Service Provider (LSP)", "Digital Lending App (DLA)"}
KNOWN_TYPES = {"DISCLOSURE", "CONSENT", "DATA_STORAGE", "REPORTING", "PROHIBITION"}


@app.get("/")
def root():
    return {
        "service": "RegulatoryFabric Compliance Engine API",
        "status": "online",
        "database": "Cloud PostgreSQL (Neon Serverless)",
        "swagger_docs": "/docs",
        "frontend_url": "http://localhost:5173",
        "endpoints": [
            "/api/health",
            "/api/documents",
            "/api/obligations",
            "/api/diff/1/2",
            "/api/matrix",
            "/api/hierarchy",
            "/api/review-queue",
            "/api/source/{clause_id}"
        ]
    }


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "RegulatoryFabric Deterministic API", "version": "1.0.0"}


@app.get("/api/documents", response_model=List[DocumentResponse])
def get_documents(db: Session = Depends(get_db)):
    return db.query(Document).order_by(Document.issue_date.desc()).all()


@app.get("/api/ingest/presets")
def get_ingest_presets():
    """
    Returns verified official RBI regulatory document links and metadata presets.
    """
    return [
        {
            "title": "RBI (Digital Lending) Directions, 2025",
            "version_id": "2025-Directions",
            "circular_no": "DOR.CRE.REC.42/21.07.001/2024-25",
            "url": "https://rbidocs.rbi.org.in/rdocs/notification/PDFs/36NT8C402BE7C2A349E0BFFF3C526668CD7A.PDF",
            "description": "Comprehensive Master Directions governing digital lending, DLAs, LSPs, APR disclosures, and default loss guarantee.",
            "is_primary": True
        },
        {
            "title": "Guidelines on Digital Lending, 2022",
            "version_id": "2022-Guidelines",
            "circular_no": "DOR.CRE.REC.66/21.07.001/2022-23",
            "url": "https://rbidocs.rbi.org.in/rdocs/notification/PDFs/GUIDELINESDIGITALLENDINGD5C35A71D8124A0E92AEB940A7D25BB3.PDF",
            "description": "Predecessor guidelines on digital lending ecosystem operations, direct borrower disbursement, and privacy protections.",
            "is_primary": False
        }
    ]


@app.post("/api/ingest/upload", response_model=IngestResponse)
async def ingest_document_upload(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    version_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Layer 5 Pipeline: Ingest raw PDF file via multipart/form-data upload.
    Extracts text, segments clauses, extracts obligations with verbatim quotes,
    computes revision diffs, and persists to Neon PostgreSQL.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF documents (.pdf) are supported.")

    try:
        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

        res = IngestionPipeline.ingest_pdf_bytes(
            pdf_bytes=pdf_bytes,
            db=db,
            title_override=title.strip() if title else None,
            version_id_override=version_id.strip() if version_id else None
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.post("/api/ingest/url", response_model=IngestResponse)
def ingest_document_url(
    req: IngestUrlRequest,
    db: Session = Depends(get_db)
):
    """
    Layer 5 Pipeline: Fetch PDF from public/official URL (e.g. RBI portal)
    and execute end-to-end extraction and ingestion into Neon PostgreSQL.
    """
    if not req.url or not req.url.startswith("http"):
        raise HTTPException(status_code=400, detail="A valid HTTP/HTTPS URL must be provided.")

    try:
        res = IngestionPipeline.ingest_from_url(
            url=req.url.strip(),
            db=db,
            title_override=req.title.strip() if req.title else None,
            version_id_override=req.version_id.strip() if req.version_id else None
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"URL Ingestion failed: {str(e)}")



@app.get("/api/entities", response_model=List[EntityResponse])
def get_entities(db: Session = Depends(get_db)):
    return db.query(Entity).all()


@app.get("/api/obligations", response_model=List[ObligationResponse])
def get_obligations(
    doc_id: Optional[int] = None,
    entity: Optional[str] = None,
    obligation_type: Optional[str] = None,
    origin: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Deterministic SQL query compilation:
    Translates UI filter parameters into parameterized SQL joins.
    """
    query = (
        db.query(Obligation)
        .join(Clause, Obligation.clause_id == Clause.id)
        .options(
            joinedload(Obligation.clause),
            selectinload(Obligation.entity_associations).joinedload(ObligationEntity.entity)
        )
    )

    if doc_id:
        query = query.filter(Clause.doc_id == doc_id)

    if obligation_type and obligation_type != "ALL":
        query = query.filter(Obligation.obligation_type == obligation_type)

    if origin and origin != "ALL":
        query = query.filter(Obligation.origin == origin)

    if status and status != "ALL":
        query = query.filter(Obligation.status == status)
    else:
        # By default exclude REJECTED from the active explorer
        query = query.filter(Obligation.status != "REJECTED")

    if entity and entity != "ALL":
        query = query.join(ObligationEntity, Obligation.id == ObligationEntity.obligation_id)\
                     .join(Entity, ObligationEntity.entity_id == Entity.id)\
                     .filter(or_(Entity.legal_type == entity, Entity.name.ilike(f"%{entity}%")))\
                     .distinct()

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Clause.section_no.ilike(search_term),
                Clause.raw_text.ilike(search_term),
                Obligation.action_required.ilike(search_term),
                Obligation.source_quote.ilike(search_term),
            )
        )

    obligations = query.all()

    # Format response with attached clause context and entity associations
    results = []
    for ob in obligations:
        ents = []
        for assoc in ob.entity_associations:
            ents.append(EntityResponse(
                id=assoc.entity.id,
                name=assoc.entity.name,
                legal_type=assoc.entity.legal_type,
                description=assoc.entity.description,
                applicability_type=assoc.applicability_type
            ))

        results.append(ObligationResponse(
            id=ob.id,
            clause_id=ob.clause_id,
            section_no=ob.clause.section_no,
            chapter_title=ob.clause.chapter_title,
            obligation_type=ob.obligation_type,
            action_required=ob.action_required,
            deadline=ob.deadline,
            frequency=ob.frequency,
            origin=ob.origin,
            confidence=ob.confidence,
            source_quote=ob.source_quote,
            status=ob.status,
            flag_reason=ob.flag_reason,
            entities=ents,
            content_hash=ob.clause.content_hash,
            page_no=ob.clause.page_no,
            paragraph_no=ob.clause.paragraph_no
        ))

    return results


@app.get("/api/diff/{v1_id}/{v2_id}", response_model=DiffResponse)
def get_regulatory_diff(v1_id: int, v2_id: int, db: Session = Depends(get_db)):
    """
    Computes deterministic side-by-side diff using SequenceMatcher.
    Zero LLM hallucinations or generative approximations.
    """
    v1_doc = db.query(Document).filter(Document.id == v1_id).first()
    v2_doc = db.query(Document).filter(Document.id == v2_id).first()

    if not v1_doc or not v2_doc:
        raise HTTPException(status_code=404, detail="One or both regulatory documents not found.")

    raw_changes = db.query(ClauseChange).filter(
        ClauseChange.doc_v1_id == v1_id,
        ClauseChange.doc_v2_id == v2_id
    ).all()

    # If no changes in (v1 -> v2) direction, check reverse (v2 -> v1)
    if not raw_changes:
        raw_changes = db.query(ClauseChange).filter(
            ClauseChange.doc_v1_id == v2_id,
            ClauseChange.doc_v2_id == v1_id
        ).all()
        if raw_changes:
            v1_doc, v2_doc = v2_doc, v1_doc

    items = []
    added = 0
    modified = 0
    removed = 0
    unchanged = 0

    for ch in raw_changes:
        if ch.change_type == "ADDED":
            added += 1
        elif ch.change_type == "MODIFIED":
            modified += 1
        elif ch.change_type == "REMOVED":
            removed += 1
        else:
            unchanged += 1

        word_tokens = compute_word_diff(ch.old_text or "", ch.new_text or "")

        items.append(DiffItemResponse(
            section_no=ch.section_no,
            title=ch.diff_summary,
            change_type=ch.change_type,
            diff_summary=ch.diff_summary,
            attribute_changes=ch.attribute_changes,
            old_text=ch.old_text,
            new_text=ch.new_text,
            word_diff=word_tokens
        ))

    return DiffResponse(
        v1_doc=DocumentResponse.model_validate(v1_doc),
        v2_doc=DocumentResponse.model_validate(v2_doc),
        total_added=added,
        total_modified=modified,
        total_removed=removed,
        total_unchanged=unchanged,
        changes=items
    )


@app.get("/api/semantic-diff/{v1_id}/{v2_id}", response_model=SemanticDiffResponse)
def get_semantic_regulatory_diff(v1_id: int, v2_id: int, db: Session = Depends(get_db)):
    """
    Intelligent 3-Stage Regulatory Comparison Engine:
    1. BREAK DOWN: Vector embeddings via gemini-embedding-001
    2. MATCH: Hungarian Bipartite Assignment via scipy.optimize.linear_sum_assignment
    3. SHOW DIFF: Fine-grained token diffs + Gemini Flash LLM executive summaries
    """
    v1_doc = db.query(Document).filter(Document.id == v1_id).first()
    v2_doc = db.query(Document).filter(Document.id == v2_id).first()

    if not v1_doc or not v2_doc:
        raise HTTPException(status_code=404, detail="One or both regulatory documents not found.")

    clauses_v1 = db.query(Clause).filter(Clause.doc_id == v1_id).order_by(Clause.page_no, Clause.paragraph_no, Clause.id).all()
    clauses_v2 = db.query(Clause).filter(Clause.doc_id == v2_id).order_by(Clause.page_no, Clause.paragraph_no, Clause.id).all()

    try:
        return SemanticDiffPipeline.compare_documents(
            doc_v1=v1_doc,
            doc_v2=v2_doc,
            clauses_v1=clauses_v1,
            clauses_v2=clauses_v2
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Semantic comparison failed: {str(e)}")



@app.get("/api/diff-review-queue/{v1_id}/{v2_id}")
def get_diff_review_queue(v1_id: int, v2_id: int, db: Session = Depends(get_db)):
    """
    P5: Stateless diff review queue — returns semantic diff items whose
    match_confidence < REVIEW_FLAG_THRESHOLD (0.75) for human review.
    Does not write to the obligation table; purely a filtered view of the
    semantic diff output.
    """
    v1_doc = db.query(Document).filter(Document.id == v1_id).first()
    v2_doc = db.query(Document).filter(Document.id == v2_id).first()
    if not v1_doc or not v2_doc:
        raise HTTPException(status_code=404, detail="One or both regulatory documents not found.")

    clauses_v1 = db.query(Clause).filter(Clause.doc_id == v1_id).order_by(Clause.page_no, Clause.paragraph_no, Clause.id).all()
    clauses_v2 = db.query(Clause).filter(Clause.doc_id == v2_id).order_by(Clause.page_no, Clause.paragraph_no, Clause.id).all()

    try:
        full_diff = SemanticDiffPipeline.compare_documents(
            doc_v1=v1_doc, doc_v2=v2_doc,
            clauses_v1=clauses_v1, clauses_v2=clauses_v2
        )
        flagged = [p for p in full_diff.paragraphs if p.review_flagged]
        return {
            "v1_doc": full_diff.v1_doc,
            "v2_doc": full_diff.v2_doc,
            "total_flagged": len(flagged),
            "items": flagged
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Diff review queue failed: {str(e)}")


@app.get("/api/matrix")
def get_entity_matrix(doc_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Cross-party applicability matrix:
    Columns = Entities (Bank, NBFC, LSP, DLA, RE)
    Rows = Obligations
    Shows DIRECT vs CONTRACTUAL_PASSTHROUGH
    """
    entities = db.query(Entity).all()
    entity_legal_map = {e.id: e.legal_type for e in entities}

    # Fetch obligations with clause joined in 1 single fast query
    query = (
        db.query(
            Obligation.id,
            Obligation.obligation_type,
            Obligation.action_required,
            Obligation.source_quote,
            Obligation.origin,
            Clause.section_no,
            Clause.chapter_title
        )
        .join(Clause, Obligation.clause_id == Clause.id)
        .filter(Obligation.status != "REJECTED")
    )
    if doc_id is not None:
        query = query.filter(Clause.doc_id == doc_id)

    obs = query.order_by(Clause.id, Obligation.id).all()

    # Fetch all associations in 1 single fast query
    assocs = db.query(ObligationEntity.obligation_id, ObligationEntity.entity_id, ObligationEntity.applicability_type).all()
    assoc_by_ob = {}
    for ob_id, ent_id, app_type in assocs:
        if ob_id not in assoc_by_ob:
            assoc_by_ob[ob_id] = {}
        assoc_by_ob[ob_id][entity_legal_map.get(ent_id, "")] = app_type

    matrix_rows = []
    for ob in obs:
        ent_map = assoc_by_ob.get(ob.id, {})
        matrix_rows.append({
            "obligation_id": ob.id,
            "section_no": ob.section_no,
            "chapter_title": ob.chapter_title,
            "obligation_type": ob.obligation_type,
            "action_required": ob.action_required,
            "source_quote": ob.source_quote,
            "origin": ob.origin,
            "entity_coverage": {
                "Bank": ent_map.get("Bank", "NONE"),
                "NBFC": ent_map.get("NBFC", "NONE"),
                "LSP": ent_map.get("LSP", "NONE"),
                "DLA": ent_map.get("DLA", "NONE"),
                "RE": ent_map.get("RE", "NONE"),
            }
        })

    return {
        "entities": [EntityResponse.model_validate(e) for e in entities],
        "rows": matrix_rows
    }


@app.get("/api/hierarchy", response_model=List[HierarchyChapter])
def get_document_hierarchy(doc_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Returns the structural outline of the circular:
    Chapter -> Section -> Clause with obligation count.
    """
    target_doc_id = doc_id or 1
    clauses = (
        db.query(Clause)
        .options(selectinload(Clause.obligations))
        .filter(Clause.doc_id == target_doc_id)
        .order_by(Clause.id)
        .all()
    )

    chapters_dict = {}
    for cl in clauses:
        ch_key = cl.chapter_no or "General"
        if ch_key not in chapters_dict:
            chapters_dict[ch_key] = {
                "chapter_no": ch_key,
                "chapter_title": cl.chapter_title or "General Provisions",
                "sections_dict": {}
            }

        sec_key = cl.section_no
        if sec_key not in chapters_dict[ch_key]["sections_dict"]:
            chapters_dict[ch_key]["sections_dict"][sec_key] = {
                "section_no": sec_key,
                "section_title": cl.clause_title or sec_key,
                "clauses": []
            }

        chapters_dict[ch_key]["sections_dict"][sec_key]["clauses"].append(
            HierarchyClause(
                id=cl.id,
                section_no=cl.section_no,
                clause_title=cl.clause_title,
                page_no=cl.page_no,
                paragraph_no=cl.paragraph_no,
                obligations_count=len(cl.obligations)
            )
        )

    result = []
    for ch_data in chapters_dict.values():
        secs = [
            HierarchySection(
                section_no=s_data["section_no"],
                section_title=s_data["section_title"],
                clauses=s_data["clauses"]
            )
            for s_data in ch_data["sections_dict"].values()
        ]
        result.append(HierarchyChapter(
            chapter_no=ch_data["chapter_no"],
            chapter_title=ch_data["chapter_title"],
            sections=secs
        ))

    return result


@app.get("/api/review-queue", response_model=List[ReviewQueueItem])
def get_review_queue(db: Session = Depends(get_db)):
    """
    Returns clauses with ambiguity or confidence < 0.85
    Human-in-the-loop audit screen.
    """
    flagged = (
        db.query(Obligation)
        .options(
            joinedload(Obligation.clause),
            selectinload(Obligation.entity_associations).joinedload(ObligationEntity.entity)
        )
        .join(Clause)
        .filter(
            or_(
                Obligation.confidence < 0.85,
                Obligation.status == "FLAGGED_FOR_REVIEW"
            )
        )
        .all()
    )

    queue = []
    for ob in flagged:
        ents = [assoc.entity.name for assoc in ob.entity_associations]
        queue.append(ReviewQueueItem(
            id=ob.id,
            clause_id=ob.clause_id,
            section_no=ob.clause.section_no,
            page_no=ob.clause.page_no,
            obligation_type=ob.obligation_type,
            action_required=ob.action_required,
            source_quote=ob.source_quote,
            raw_text=ob.clause.raw_text,
            origin=ob.origin,
            confidence=ob.confidence,
            status=ob.status,
            flag_reason=ob.flag_reason or "Low confidence extraction (< 0.85)",
            entities=ents
        ))

    return queue


@app.post("/api/review-queue/{obligation_id}/action")
def take_review_action(
    obligation_id: int,
    action_req: ReviewActionRequest,
    db: Session = Depends(get_db)
):
    """
    Human sign-off: Approve, Edit Taxonomy, or Reject flagged extraction.
    """
    ob = db.query(Obligation).filter(Obligation.id == obligation_id).first()
    if not ob:
        raise HTTPException(status_code=404, detail="Obligation not found")

    act = action_req.action.upper()
    if act == "APPROVE":
        ob.status = "APPROVED_BY_HUMAN"
        ob.confidence = 1.0
    elif act == "REJECT":
        ob.status = "REJECTED"
    elif act == "EDIT":
        if action_req.corrected_type:
            ob.obligation_type = action_req.corrected_type
        ob.status = "APPROVED_BY_HUMAN"
        ob.confidence = 1.0
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported action: {action_req.action}")

    db.commit()
    return {"status": "success", "obligation_id": ob.id, "new_status": ob.status}


@app.get("/api/source/{clause_id}", response_model=TraceabilityResponse)
def get_source_traceability(clause_id: int, db: Session = Depends(get_db)):
    """
    Universal Source Traceability Drawer Payload:
    Provides exact verbatim quote, page, paragraph, SHA-256 hash,
    and mathematical verification proofs back to RBI source text.
    """
    cl = (
        db.query(Clause)
        .options(
            joinedload(Clause.document),
            selectinload(Clause.obligations).selectinload(Obligation.entity_associations).joinedload(ObligationEntity.entity)
        )
        .filter(Clause.id == clause_id)
        .first()
    )
    if not cl:
        raise HTTPException(status_code=404, detail="Clause not found")

    primary_ob = cl.obligations[0] if cl.obligations else None
    source_quote = primary_ob.source_quote if primary_ob else ""
    applies_to = [a.entity.name for a in primary_ob.entity_associations] if primary_ob else []
    ob_type = primary_ob.obligation_type if primary_ob else "DISCLOSURE"
    origin = primary_ob.origin if primary_ob else "DIRECT"
    confidence = primary_ob.confidence if primary_ob else 1.0

    # STAGE 1: Exact Verbatim Substring Check
    stage1_verified = source_quote in cl.raw_text if source_quote else False

    # STAGE 2: Controlled Taxonomy Check
    stage2_verified = (
        ob_type in KNOWN_TYPES and
        all(e in KNOWN_ENTITIES for e in applies_to)
    )

    return TraceabilityResponse(
        clause_id=cl.id,
        doc_title=cl.document.title,
        circular_no=cl.document.circular_no,
        issue_date=cl.document.issue_date,
        section_no=cl.section_no,
        page_no=cl.page_no,
        paragraph_no=cl.paragraph_no,
        content_hash=cl.content_hash,
        raw_text=cl.raw_text,
        source_quote=source_quote,
        stage1_verbatim_verified=stage1_verified,
        stage2_taxonomy_validated=stage2_verified,
        origin=origin,
        confidence=confidence,
        allowed_entities=list(KNOWN_ENTITIES),
        allowed_types=list(KNOWN_TYPES),
        applies_to=applies_to,
        obligation_type=ob_type
    )
