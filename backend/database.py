import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Load from backend/.env explicitly, and also fallback to root .env
backend_env = Path(__file__).resolve().parent / ".env"
if backend_env.exists():
    load_dotenv(dotenv_path=backend_env)
load_dotenv()

# Check for Neon PostgreSQL DATABASE_URL, fallback gracefully to SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./regulatory_fabric.db"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    print("[DB] Using Local SQLite Database: ./regulatory_fabric.db")
else:
    # Handles postgresql:// vs postgres:// URL formats
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=10,
        max_overflow=20
    )
    print("[DB] Connected to Cloud PostgreSQL (Neon Serverless)")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """
    Idempotent additive migrations — safe to run on every startup.
    P3: Add structural_type column to clauses if it does not yet exist.
    """
    try:
        with engine.begin() as conn:
            # Detect dialect
            dialect = engine.dialect.name
            if dialect == "sqlite":
                # SQLite: check via PRAGMA
                result = conn.execute(text("PRAGMA table_info(clauses)"))
                cols = [row[1] for row in result]
                if "structural_type" not in cols:
                    conn.execute(text(
                        "ALTER TABLE clauses ADD COLUMN structural_type VARCHAR(50) DEFAULT 'main_clause'"
                    ))
                    print("[DB Migration] Added structural_type column to clauses (SQLite)")
            else:
                # PostgreSQL: ADD COLUMN IF NOT EXISTS
                conn.execute(text(
                    "ALTER TABLE clauses ADD COLUMN IF NOT EXISTS "
                    "structural_type VARCHAR(50) DEFAULT 'main_clause'"
                ))
                print("[DB Migration] Ensured structural_type column exists in clauses (PostgreSQL)")
    except Exception as e:
        print(f"[DB Migration] structural_type migration notice: {e}")
