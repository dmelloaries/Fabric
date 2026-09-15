export interface Entity {
  id: number;
  name: string;
  legal_type: string;
  description?: string;
  applicability_type?: string;
}

export interface Obligation {
  id: number;
  clause_id: number;
  section_no: string;
  chapter_title?: string;
  obligation_type: string;
  action_required: string;
  deadline?: string;
  frequency?: string;
  origin: string; // DIRECT, DERIVED, INFERRED
  confidence: number;
  source_quote: string;
  status: string;
  flag_reason?: string;
  entities: Entity[];
  content_hash: string;
  page_no: number;
  paragraph_no: number;
}

export interface DocumentInfo {
  id: number;
  title: string;
  circular_no: string;
  issue_date: string;
  version_id: string;
  sha256_hash: string;
}

export interface TraceabilityData {
  clause_id: number;
  doc_title: string;
  circular_no: string;
  issue_date: string;
  section_no: string;
  page_no: number;
  paragraph_no: number;
  content_hash: string;
  raw_text: string;
  source_quote: string;
  stage1_verbatim_verified: boolean;
  stage2_taxonomy_validated: boolean;
  origin: string;
  confidence: number;
  allowed_entities: string[];
  allowed_types: string[];
  applies_to: string[];
  obligation_type: string;
}

export interface DiffWordToken {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface DiffItem {
  section_no: string;
  title: string;
  change_type: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'UNCHANGED';
  diff_summary: string;
  attribute_changes?: string;
  old_text?: string;
  new_text?: string;
  word_diff: DiffWordToken[];
}

export interface DiffResponse {
  v1_doc: DocumentInfo;
  v2_doc: DocumentInfo;
  total_added: number;
  total_modified: number;
  total_removed: number;
  total_unchanged: number;
  changes: DiffItem[];
}

export interface MatrixRow {
  obligation_id: number;
  section_no: string;
  chapter_title?: string;
  obligation_type: string;
  action_required: string;
  source_quote: string;
  origin: string;
  entity_coverage: Record<string, string>;
}

export interface HierarchyChapter {
  chapter_no: string;
  chapter_title: string;
  sections: {
    section_no: string;
    section_title: string;
    clauses: {
      id: number;
      section_no: string;
      clause_title?: string;
      page_no: number;
      paragraph_no: number;
      obligations_count: number;
    }[];
  }[];
}

export interface ReviewQueueItem {
  id: number;
  clause_id: number;
  section_no: string;
  page_no: number;
  obligation_type: string;
  action_required: string;
  source_quote: string;
  raw_text: string;
  origin: string;
  confidence: number;
  status: string;
  flag_reason: string;
  entities: string[];
}

const API_BASE = "http://127.0.0.1:8000/api";
const DEFAULT_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDocuments(): Promise<DocumentInfo[]> {
  const res = await fetchWithTimeout(`${API_BASE}/documents`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.statusText}`);
  return await res.json();
}

export async function fetchObligations(params?: {
  doc_id?: number;
  entity?: string;
  obligation_type?: string;
  origin?: string;
  search?: string;
}): Promise<Obligation[]> {
  const url = new URL(`${API_BASE}/obligations`);
  if (params?.doc_id) url.searchParams.append("doc_id", params.doc_id.toString());
  if (params?.entity && params.entity !== "ALL") url.searchParams.append("entity", params.entity);
  if (params?.obligation_type && params.obligation_type !== "ALL") url.searchParams.append("obligation_type", params.obligation_type);
  if (params?.origin && params.origin !== "ALL") url.searchParams.append("origin", params.origin);
  if (params?.search) url.searchParams.append("search", params.search);

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch obligations: ${res.statusText}`);
  return await res.json();
}

export async function fetchRegulatoryDiff(v1: number = 1, v2: number = 2): Promise<DiffResponse | null> {
  const res = await fetchWithTimeout(`${API_BASE}/diff/${v1}/${v2}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to fetch diff");
  }
  return await res.json();
}

export interface SemanticDiffItem {
  paragraph_no: string;
  heading: string;
  v1_section: string | null;
  v2_section: string | null;
  change_type: 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'REMOVED';
  similarity_score: number;
  changes_detected_count: number;
  old_text: string | null;
  new_text: string | null;
  word_diff: DiffWordToken[];
  effective_date: string | null;
  regulator: string;
  reference_circular: string | null;
  section_context: string | null;
  impact_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'EDITORIAL';
  category: string | null;
  executive_summary: string | null;
  compliance_action: string | null;
  affected_entities: string[];
}

export interface SemanticDiffSummary {
  total_paragraphs: number;
  changed_count: number;
  changed_percentage: number;
  unchanged_count: number;
  unchanged_percentage: number;
  added_count: number;
  removed_count: number;
  modified_count: number;
}

export interface SemanticDiffResponse {
  v1_doc: DocumentInfo;
  v2_doc: DocumentInfo;
  summary: SemanticDiffSummary;
  paragraphs: SemanticDiffItem[];
}

/**
 * Fetch the intelligent 3-stage semantic diff using Hungarian bipartite matching
 * and Gemini LLM classification. Falls back to TF-IDF if Gemini is unavailable.
 * Timeout extended to 120s to allow for embedding generation + LLM classification.
 */
export async function fetchSemanticDiff(v1: number, v2: number): Promise<SemanticDiffResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/semantic-diff/${v1}/${v2}`, {}, 120000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Semantic diff failed with status ${res.status}`);
  }
  return await res.json();
}

export async function fetchEntityMatrix(): Promise<{ entities: Entity[]; rows: MatrixRow[] }> {
  const res = await fetchWithTimeout(`${API_BASE}/matrix`);
  if (!res.ok) throw new Error("Failed to fetch entity matrix");
  return await res.json();
}

export async function fetchHierarchy(docId: number = 1): Promise<HierarchyChapter[]> {
  const res = await fetchWithTimeout(`${API_BASE}/hierarchy?doc_id=${docId}`);
  if (!res.ok) throw new Error("Failed to fetch hierarchy");
  return await res.json();
}

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  const res = await fetchWithTimeout(`${API_BASE}/review-queue`);
  if (!res.ok) throw new Error("Failed to fetch review queue");
  return await res.json();
}

export async function submitReviewAction(obligationId: number, action: string, correctedType?: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_BASE}/review-queue/${obligationId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, corrected_type: correctedType })
  });
  return res.ok;
}

export async function fetchSourceTraceability(clauseId: number): Promise<TraceabilityData> {
  const res = await fetchWithTimeout(`${API_BASE}/source/${clauseId}`);
  if (!res.ok) throw new Error("Failed to fetch source traceability");
  return await res.json();
}

export interface IngestPreset {
  title: string;
  version_id: string;
  circular_no: string;
  url: string;
  description: string;
  is_primary: boolean;
}

export interface IngestResponse {
  document_id: number;
  title: string;
  circular_no: string;
  version_id: string;
  sha256_hash: string;
  total_pages: number;
  clauses_extracted: number;
  obligations_extracted: number;
  verified_count: number;
  flagged_count: number;
  status: string;
}

export async function fetchIngestPresets(): Promise<IngestPreset[]> {
  const res = await fetchWithTimeout(`${API_BASE}/ingest/presets`);
  if (!res.ok) throw new Error("Failed to fetch ingestion presets");
  return await res.json();
}

export async function ingestDocumentUpload(formData: FormData): Promise<IngestResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/ingest/upload`, {
    method: "POST",
    body: formData,
  }, 60000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
  }
  return await res.json();
}

export async function ingestDocumentUrl(payload: {
  url: string;
  title?: string;
  version_id?: string;
}): Promise<IngestResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/ingest/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 60000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `URL ingestion failed with status ${res.status}`);
  }
  return await res.json();
}

