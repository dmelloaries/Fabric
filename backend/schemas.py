from typing import List, Optional
from pydantic import BaseModel, Field


class EntityResponse(BaseModel):
    id: int
    name: str
    legal_type: str
    description: Optional[str] = None
    applicability_type: Optional[str] = "DIRECT"

    class Config:
        from_attributes = True


class ObligationResponse(BaseModel):
    id: int
    clause_id: int
    section_no: str
    chapter_title: Optional[str] = None
    obligation_type: str
    action_required: str
    deadline: Optional[str] = None
    frequency: Optional[str] = None
    origin: str  # DIRECT, DERIVED, INFERRED
    confidence: float
    source_quote: str
    status: str
    flag_reason: Optional[str] = None
    entities: List[EntityResponse] = []
    content_hash: str
    page_no: int
    paragraph_no: int

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: int
    title: str
    circular_no: str
    issue_date: str
    version_id: str
    sha256_hash: str

    class Config:
        from_attributes = True


class TraceabilityResponse(BaseModel):
    clause_id: int
    doc_title: str
    circular_no: str
    issue_date: str
    section_no: str
    page_no: int
    paragraph_no: int
    content_hash: str
    raw_text: str
    source_quote: str
    stage1_verbatim_verified: bool
    stage2_taxonomy_validated: bool
    origin: str
    confidence: float
    allowed_entities: List[str]
    allowed_types: List[str]
    applies_to: List[str]
    obligation_type: str


class DiffWordToken(BaseModel):
    type: str  # 'equal', 'insert', 'delete'
    text: str


class DiffItemResponse(BaseModel):
    section_no: str
    title: str
    change_type: str  # 'ADDED', 'MODIFIED', 'REMOVED', 'UNCHANGED'
    diff_summary: str
    attribute_changes: Optional[str] = None
    old_text: Optional[str] = None
    new_text: Optional[str] = None
    word_diff: List[DiffWordToken] = []


class DiffResponse(BaseModel):
    v1_doc: DocumentResponse
    v2_doc: DocumentResponse
    total_added: int
    total_modified: int
    total_removed: int
    total_unchanged: int
    changes: List[DiffItemResponse]


class HierarchyClause(BaseModel):
    id: int
    section_no: str
    clause_title: Optional[str] = None
    page_no: int
    paragraph_no: int
    obligations_count: int


class HierarchySection(BaseModel):
    section_no: str
    section_title: str
    clauses: List[HierarchyClause] = []


class HierarchyChapter(BaseModel):
    chapter_no: str
    chapter_title: str
    sections: List[HierarchySection] = []


class ReviewQueueItem(BaseModel):
    id: int
    clause_id: int
    section_no: str
    page_no: int
    obligation_type: str
    action_required: str
    source_quote: str
    raw_text: str
    origin: str
    confidence: float
    status: str
    flag_reason: str
    entities: List[str] = []


class ReviewActionRequest(BaseModel):
    action: str = Field(..., description="APPROVE, EDIT, or REJECT")
    corrected_type: Optional[str] = None
    corrected_entities: Optional[List[str]] = None
    notes: Optional[str] = None


class IngestUrlRequest(BaseModel):
    url: str
    title: Optional[str] = None
    version_id: Optional[str] = None


class IngestResponse(BaseModel):
    document_id: int
    title: str
    circular_no: str
    version_id: str
    sha256_hash: str
    total_pages: int
    clauses_extracted: int
    obligations_extracted: int
    verified_count: int
    flagged_count: int
    status: str


class SemanticDiffItem(BaseModel):
    paragraph_no: str
    heading: str
    v1_section: Optional[str] = None
    v2_section: Optional[str] = None
    change_type: str  # 'UNCHANGED', 'MODIFIED', 'ADDED', 'REMOVED'
    similarity_score: float = 1.0
    changes_detected_count: int = 0
    old_text: Optional[str] = None
    new_text: Optional[str] = None
    word_diff: List[DiffWordToken] = []
    effective_date: Optional[str] = None
    regulator: str = "RBI"
    reference_circular: Optional[str] = None
    section_context: Optional[str] = None
    # LLM Classification Insights
    impact_level: str = "LOW"  # 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'EDITORIAL'
    category: Optional[str] = None
    executive_summary: Optional[str] = None
    compliance_action: Optional[str] = None
    affected_entities: List[str] = []
    # P1/P4/P5: Embedding instrumentation & confidence metadata
    embedding_source: str = "unknown"   # 'gemini' | 'tfidf_fallback' | 'unknown'
    match_confidence: float = 0.0        # hybrid score of the winning pair (0.0 for ADDED/REMOVED)
    match_method: str = "embedding"      # 'heading' | 'embedding' | 'none'
    review_flagged: bool = False          # True when match_confidence < REVIEW_FLAG_THRESHOLD


class SemanticDiffSummary(BaseModel):
    total_paragraphs: int
    changed_count: int
    changed_percentage: float
    unchanged_count: int
    unchanged_percentage: float
    added_count: int
    removed_count: int
    modified_count: int


class SemanticDiffResponse(BaseModel):
    v1_doc: DocumentResponse
    v2_doc: DocumentResponse
    summary: SemanticDiffSummary
    paragraphs: List[SemanticDiffItem]

