# RegulatoryFabric — RBI Digital Lending Compliance Explorer

> A professional compliance workstation for financial institutions to explore, compare, and trace regulatory requirements across **Reserve Bank of India (RBI)** digital lending circulars.

Built in response to the **RegulatoryFabric Engineering Assignment**, following the architecture specified in [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) and [`Flowchart.drawio`](./Flowchart.drawio).

---

## 1. Executive Summary & Approach

In banking regulation, compliance is a **zero-defect discipline**. Compliance officers cannot rely on generic Generative AI summaries that might hallucinate deadlines, invent liabilities, or miss subtle amendments.

**RegulatoryFabric** replaces black-box LLM summaries with **verifiable structured compliance data**:
1. **Bounded AI Ingestion**: Generative AI (LLMs) is strictly confined to offline, clause-isolated extraction, bounded by strict Pydantic v2 schemas and two-stage programmatic guardrails.
2. **Deterministic Database Surface**: 100% of runtime operations—faceted filtering, statutory keyword search, word-level version diffing, and cross-party responsibility matrices—are executed via deterministic SQL and Python standard library algorithms (`difflib.SequenceMatcher`).
3. **Zero Generative RAG at Query Time**: Zero LLM tokens are generated when querying or inspecting data. Every fact displayed is an immutable database record with verifiable source provenance.
4. **Universal Source Traceability**: A compliance officer can click **Inspect Source** on any row across the application to view the exact verbatim quote highlighted within the complete statutory text, verified against physical page coordinates and content-addressed SHA-256 hashes.

---

## 2. Core Capabilities Demonstrated

| Feature | Assignment Requirement | Implementation in RegulatoryFabric |
| :--- | :--- | :--- |
| **Tab 1: Obligation Explorer** | *Explore regulatory requirements* | Searchable, faceted database of atomic obligations with filters for Category (*Prohibition, Disclosure, Consent, Data Storage, Reporting*), Entity, and Origin (*Direct, Derived, Inferred*). One-click CSV export for audit review. |
| **Tab 2: Regulatory Diff & Timeline** | *Identify regulatory changes* | Deterministic side-by-side comparison between the 2022 Guidelines and 2025 Directions. Displays change status (*Added, Modified, Removed, Unchanged*), structured attribute shifts (e.g. 5% FLDG cap), and word-level red/green visual token diffs. |
| **Tab 3: Entity Coverage Matrix** | *Show applicability* | Cross-party accountability grid across Banks, NBFCs, LSPs, and DLAs. Explicitly distinguishes between **Direct Statutory Liability** and **Contractual Passthrough Monitoring Duties** without fabricating applicability. |
| **Tab 4: Document Hierarchy Tree** | *Structural document navigation* | Collapsible structural outline preserving authentic legal numbering (*Chapter &rarr; Section &rarr; Clause*) with official RBI Gazette PDF page and paragraph coordinates. |
| **Tab 5: Compliance Review Queue** | *Uncertainty & human-in-the-loop* | Quarantines extractions with confidence `< 0.85` or ambiguous drafting. Allows compliance officers to **Approve**, **Edit Taxonomy**, or **Reject**, preventing unsupported conclusions from entering the active database. |
| **Universal Traceability Drawer** | *Provide source traceability* | Slide-out provenance inspector accessible from every tab. Shows verbatim quote highlighting against raw statutory text, cryptographic SHA-256 hash, and provenance origin badges. |

---

## 3. Quickstart: How to Run the Project Locally

The prototype runs locally with **zero external cloud infrastructure required** (uses local SQLite by default, or connects to Neon PostgreSQL if configured).

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** and **npm**

---

### Step 1: Backend Setup (FastAPI + SQLite / PostgreSQL)

Open a terminal:
```bash
# 1. Navigate to the project root
cd Regulatory-fabric

# 2. (Recommended) Create and activate a Python virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# 3. Install backend dependencies
pip install -r backend/requirements.txt

# 4. (Optional) Configure environment variables
# Copy .env.example to .env:
#   DATABASE_URL: Leave unset to automatically use local SQLite (./regulatory_fabric.db) with ZERO config!
#   GEMINI_API_KEY: Optional; used for embeddings and summary generation. Falls back gracefully to TF-IDF if unset.

# 5. Initialize and verify database tables & taxonomy
python -m backend.seed

# 6. Start the FastAPI server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend will start at `http://127.0.0.1:8000`.  
- Interactive API Documentation (Swagger UI): `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

To verify all backend API endpoints via automated test suite:
```bash
python -m backend.test_api
```

---

### Step 2: Frontend Setup (Vite + React + TypeScript)

Open a second terminal:
```bash
# 1. Navigate to the frontend directory
cd Regulatory-fabric/frontend

# 2. Install frontend dependencies
npm install

# 3. Start the Vite development server
npm run dev -- --host 127.0.0.1 --port 5173
```

Open your browser at **`http://127.0.0.1:5173`** to access the Compliance Operating Workstation.

---

## 4. Dependencies & Prerequisites

### Backend Dependencies (`backend/requirements.txt`)
- **FastAPI (0.110+)**: High-performance asynchronous API framework.
- **Uvicorn (0.28+)**: ASGI server.
- **SQLAlchemy (2.0+)**: Relational ORM supporting SQLite and PostgreSQL dialect switching.
- **Pydantic (v2)**: Strict type and schema validation for API models and LLM extractions.
- **google-genai / google-generativeai**: Gemini SDK for embeddings and bounded executive delta summaries.
- **scikit-learn & numpy**: Numerical operations and TF-IDF fallback vectorization.
- **scipy**: Hungarian algorithm (`linear_sum_assignment`) for global bipartite clause matching.
- **python-dotenv**: Environment variable management.
- **pypdf / pymupdf**: PDF text extraction and coordinate indexing.

### Frontend Dependencies (`frontend/package.json`)
- **React (18+) & TypeScript**: Strict type safety and component modularity.
- **Vite (5+)**: Fast build and hot-module replacement server.
- **Tailwind CSS**: Utility-first institutional styling system.
- **Radix UI (@radix-ui/react-*)**: Accessible primitives for dialogs, tooltips, dropdowns, and tabs.
- **Lucide React**: Iconography.
- **Sonner**: Toast notification system.

---

## 5. Configuration Required

Configuration is managed via `backend/.env` (or environment variables). A template is provided in `backend/.env.example`:

| Environment Variable | Required? | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | No | `sqlite:///./regulatory_fabric.db` | PostgreSQL connection string (e.g. Neon Serverless). If left unset, automatically defaults to local SQLite with zero setup. |
| `GEMINI_API_KEY` | No | `""` (Empty string) | Google Gemini API key. If unset or invalid, the engine automatically falls back to deterministic TF-IDF embeddings and offline algorithmic diffing. |
| `REJECTION_THRESHOLD` | No | `0.60` | Minimum hybrid similarity score for bipartite clause matching. Pairs below this are marked as `ADDED` or `REMOVED`. |
| `REVIEW_FLAG_THRESHOLD` | No | `0.75` | Clauses with confidence below this threshold are flagged for human review in Tab 5. |
| `HEADING_MATCH_MIN_RATIO`| No | `0.85` | Minimum Levenshtein fuzzy-match ratio for Pass-1 heading alignment. |

---

## 6. System Architecture & Diagram

The complete architecture is documented in [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) and visually modeled in [`Flowchart.drawio`](./Flowchart.drawio):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: COMPLIANCE OPERATING UI (Vite / React + TypeScript)                │
│  Tab 1: Obligation Explorer  |  Tab 2: Regulatory Diff  |  Tab 3: Matrix     │
│  Tab 4: Hierarchy Tree       |  Tab 5: Review Queue     |  Source Drawer    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP REST (JSON)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ LAYER 2: DETERMINISTIC BACKEND (FastAPI + Python 3.11)                      │
│  • Deterministic SQL Compiler   • 4-Pass Semantic & Token Diff Engine       │
│  • Provenance & Hash Service    • In-Memory Process LRU Cache               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Parameterized SQL
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ LAYER 3 & 4: STORAGE TIER (PostgreSQL on Neon Cloud / Local SQLite)         │
│  • 6 Relational Tables: documents, clauses, obligations, entities,          │
│    obligation_entities, clause_changes                                      │
│  • Full-Text tsvector / Content-addressed SHA-256 integrity hashes          │
└──────────────────────────────────────▲──────────────────────────────────────┘
                                       │ Transactional Commit
┌──────────────────────────────────────┴──────────────────────────────────────┐
│ LAYER 5: INGESTION PIPELINE (Bounded AI + Two-Stage Guardrails)             │
│  • PDF Parser & Regex AST Splitter (Chapter > Section > Clause)             │
│  • Bounded LLM Extraction (Strict JSON Pydantic Schema)                     │
│  • Stage 1 Guard: assert source_quote in raw_text (Verbatim Substring)      │
│  • Stage 2 Guard: assert applies_to in KNOWN_ENTITIES (Controlled Taxonomy) │
│  • Gating: Confidence < 0.85 quarantined to Tab 5 Review Queue              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. AI Usage & Self-Designed Components (Evaluation Criteria)

As required by the assignment guidelines:

### What We Used AI For
- **Offline Bounded Ingestion**: Extracting initial candidate facts from isolated individual clauses into structured JSON schemas.
- **Delta Summarization**: Generating a single concise sentence summarizing the conceptual difference between matched clause pairs.
- **Dense Embeddings**: Computing semantic clause vectors via `gemini-embedding-001` (with automatic TF-IDF fallback when offline).

### Which Parts We Designed Ourselves
- **Two-Stage Programmatic Guardrails**: Code-level verification ensuring `source_quote in raw_text` and enforcing closed entity taxonomies.
- **4-Pass Diff Engine**: Bipartite Hungarian matching algorithm with structural type incompatibility penalties (preventing false matches between cover letters and annex tables).
- **Deterministic Query Compiler**: Translating UI multi-facet filters into parameterized SQL joins with zero LLM generation at query time.
- **Relational Data Model**: 6-table schema capturing direct statutory liability vs. contractual passthrough monitoring.
- **Human-in-the-Loop Review Queue**: Architecture isolating uncertain extractions from the production compliance registry.

### Why We Made These Architectural Choices
- Banking compliance requires **auditability, reproducibility, and zero hallucination risk**.
- Runtime Generative RAG introduces non-determinism, unpredictable latency, and potential hallucination.
- Relational SQL queries and deterministic string matching provide millisecond response times and verifiable proof.

### How We Verified Output
- **Stage 1 Verbatim Check**: Automatic test ensuring 100% of active obligations are verbatim substrings of official RBI text.
- **Automated Test Suite (`test_api.py`)**: End-to-end integration tests verifying endpoints, response schemas, and traceability coordinates.
- **Cross-Checking against RBI Gazette**: Hand-verifying key provisions (e.g. 5% FLDG cap, KFS requirements, direct disbursement mandates).

---

## 8. Known Limitations

Given the ~4-hour time constraint:
1. **Multi-Column PDF Layouts**: Official RBI Gazette PDFs occasionally feature multi-column footnotes or schedule tables. In rare cases, complex visual tables require manual layout adjustment (in production, a dedicated OCR tool like LlamaParse or LayoutLM would be used).
2. **Batch Ingestion Concurrency**: The prototype processes documents synchronously during upload rather than via a distributed background worker queue.
3. **Two Regulatory Circulars Loaded**: The prototype is focused on demonstrating depth over the RBI Digital Lending ecosystem (2022 Guidelines vs. 2025 Directions) rather than indexing the entirety of the RBI Master Directions repository.

---

## 9. What We Would Build Next (Future Roadmap)

If given additional engineering time:
1. **Automated Regulatory Scraper & Webhooks**:
   - Continuously poll the RBI Gazette notification feed, automatically parse new circulars upon publication, compute diffs against predecessor circulars, and dispatch instant Slack/email notifications to affected compliance teams.
2. **Statutory Citation & Amending Graph**:
   - Model cross-document citation networks (`AMENDS`, `SUPERSEDES`, `CLARIFIES`) to visualize circular ancestry across decades of amendments.
3. **Redline Export to Microsoft Word & PDF**:
   - One-click export of the Tab 2 word-level diff into formal redlined `.docx` and `.pdf` reports suitable for submission to internal audit committees and board risk meetings.
4. **Multi-Jurisdiction & Cross-Regulator Reconciliation**:
   - Extend the entity taxonomy to map overlapping mandates across SEBI (securities), IRDAI (insurance), and RBI (banking) for composite financial entities.
5. **Role-Based Access Control (RBAC) & Audit Trails**:
   - Institutional SSO (SAML/Okta), immutable change logs detailing who approved which item in the Review Queue, and digital signatures for compliance sign-offs.

---

## 10. External References & Sources

1. **Reserve Bank of India (RBI) Guidelines on Digital Lending**:
   - Circular No: `DOR.CRE.REC.66/21.07.001/2022-23` (September 2, 2022)
   - Source: [RBI Official Notification](https://rbidocs.rbi.org.in/rdocs/notification/PDFs/GUIDELINESDIGITALLENDINGD5C35A71D8124A0E92AEB940A7D25BB3.PDF)
2. **Reserve Bank of India (RBI) Digital Lending Directions, 2025 / FLDG Directions**:
   - Circular No: `DOR.CRE.REC.42/21.07.001/2024-25`
   - Source: [RBI Gazette Notification](https://rbidocs.rbi.org.in/rdocs/notification/PDFs/36NT8C402BE7C2A349E0BFFF3C526668CD7A.PDF)
3. **Kuhn-Munkres (Hungarian) Algorithm**:
   - Harold W. Kuhn, *"The Hungarian Method for the Assignment Problem"*, Naval Research Logistics Quarterly, 1955.
4. **Python `difflib.SequenceMatcher`**:
   - Ratcliff and Obershelp, *"Pattern Matching: The Gestalt Approach"*, Dr. Dobb's Journal, 1988.
