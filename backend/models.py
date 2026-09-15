from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from backend.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    circular_no = Column(String(100), nullable=False)
    issue_date = Column(String(50), nullable=False)
    version_id = Column(String(50), nullable=False, unique=True)
    file_path = Column(String(255), nullable=True)
    sha256_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=func.now())

    clauses = relationship("Clause", back_populates="document", cascade="all, delete-orphan")


class Clause(Base):
    __tablename__ = "clauses"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    chapter_no = Column(String(50), nullable=True)
    chapter_title = Column(String(255), nullable=True)
    section_no = Column(String(50), nullable=False, index=True)
    clause_title = Column(String(255), nullable=True)
    raw_text = Column(Text, nullable=False)
    page_no = Column(Integer, nullable=False)
    paragraph_no = Column(Integer, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)

    document = relationship("Document", back_populates="clauses")
    obligations = relationship("Obligation", back_populates="clause", cascade="all, delete-orphan")
    # P3: Structural classification for incompatible-type cost penalty
    structural_type = Column(String(50), nullable=True, server_default="main_clause")  # cover_letter|main_clause|annex_table|footnote|definitions


class Entity(Base):
    __tablename__ = "entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    legal_type = Column(String(50), nullable=False)  # Bank, NBFC, LSP, DLA, RE
    description = Column(Text, nullable=True)

    obligation_associations = relationship("ObligationEntity", back_populates="entity")


class Obligation(Base):
    __tablename__ = "obligations"

    id = Column(Integer, primary_key=True, index=True)
    clause_id = Column(Integer, ForeignKey("clauses.id"), nullable=False)
    obligation_type = Column(String(50), nullable=False, index=True)  # DISCLOSURE, CONSENT, DATA_STORAGE, REPORTING, PROHIBITION
    action_required = Column(Text, nullable=False)
    deadline = Column(String(100), nullable=True)
    frequency = Column(String(100), nullable=True)
    origin = Column(String(50), nullable=False, default="DIRECT")  # DIRECT, DERIVED, INFERRED
    confidence = Column(Float, nullable=False, default=1.0)  # 0.0 to 1.0
    source_quote = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="VERIFIED")  # VERIFIED, FLAGGED_FOR_REVIEW, APPROVED_BY_HUMAN, REJECTED
    flag_reason = Column(Text, nullable=True)

    clause = relationship("Clause", back_populates="obligations")
    entity_associations = relationship("ObligationEntity", back_populates="obligation", cascade="all, delete-orphan")


class ObligationEntity(Base):
    __tablename__ = "obligation_entities"

    id = Column(Integer, primary_key=True, index=True)
    obligation_id = Column(Integer, ForeignKey("obligations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    applicability_type = Column(String(50), nullable=False, default="DIRECT")  # DIRECT, CONTRACTUAL_PASSTHROUGH
    notes = Column(Text, nullable=True)

    obligation = relationship("Obligation", back_populates="entity_associations")
    entity = relationship("Entity", back_populates="obligation_associations")


class ClauseChange(Base):
    __tablename__ = "clause_changes"

    id = Column(Integer, primary_key=True, index=True)
    doc_v1_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    doc_v2_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    old_clause_id = Column(Integer, ForeignKey("clauses.id"), nullable=True)
    new_clause_id = Column(Integer, ForeignKey("clauses.id"), nullable=True)
    section_no = Column(String(50), nullable=False)
    change_type = Column(String(50), nullable=False)  # ADDED, MODIFIED, REMOVED, UNCHANGED
    diff_summary = Column(Text, nullable=False)
    attribute_changes = Column(Text, nullable=True)  # JSON or text description of changed deadlines/caps
    old_text = Column(Text, nullable=True)
    new_text = Column(Text, nullable=True)
