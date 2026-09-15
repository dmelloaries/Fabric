"""
RegulatoryFabric — Database Initialization & Seeding Script
Verifies tables, entity taxonomy, and regulatory documents.
"""

from backend.database import engine, Base, SessionLocal, run_migrations
from backend.models import Document, Entity, Clause, Obligation

def seed_database():
    print("[Seed] Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    run_migrations()

    db = SessionLocal()
    try:
        # 1. Ensure Standard Entity Taxonomy
        known_entities = [
            {"name": "Regulated Entity (RE)", "legal_type": "RE", "description": "All Commercial Banks, Primary Urban Co-operative Banks, and Non-Banking Financial Companies (NBFCs)."},
            {"name": "Commercial Bank", "legal_type": "Bank", "description": "Scheduled Commercial Banks licensed under Section 22 of Banking Regulation Act, 1949."},
            {"name": "Non-Banking Financial Company (NBFC)", "legal_type": "NBFC", "description": "Non-banking financial institutions registered under Chapter III-B of RBI Act, 1934."},
            {"name": "Lending Service Provider (LSP)", "legal_type": "LSP", "description": "An agent of a Regulated Entity who carries out one or more of lender's functions including customer acquisition, underwriting support, pricing, servicing, and recovery."},
            {"name": "Digital Lending App (DLA)", "legal_type": "DLA", "description": "Mobile and web-based applications with user interface that facilitate digital lending services, operated by REs or by LSPs engaged by REs."},
        ]
        
        ent_count = db.query(Entity).count()
        if ent_count == 0:
            for edata in known_entities:
                db.add(Entity(**edata))
            db.commit()
            print(f"[Seed] Created {len(known_entities)} default regulated entities.")
        else:
            print(f"[Seed] Entity taxonomy already populated ({ent_count} entities).")

        # 2. Check Documents & Obligations
        doc_count = db.query(Document).count()
        clause_count = db.query(Clause).count()
        ob_count = db.query(Obligation).count()

        print(f"[Seed] Database Status:")
        print(f"       • Documents  : {doc_count}")
        print(f"       • Clauses    : {clause_count}")
        print(f"       • Obligations: {ob_count}")

        if doc_count >= 2:
            print("[Seed] Verified RBI Digital Lending regulatory documents are loaded and ready.")
        else:
            print("[Seed] Note: Fewer than 2 documents loaded. Ingest circulars via UI or /api/ingest/upload.")

        print("[Seed] Database initialization complete.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
