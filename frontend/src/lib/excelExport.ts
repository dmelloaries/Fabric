import * as XLSX from 'xlsx';
import type { DiffResponse, Obligation, MatrixRow, Entity, SemanticDiffResponse } from '../api';

/**
 * Browser-safe download helper.
 * XLSX.writeFile() strips the filename in Vite/Chrome (saves as UUID with no extension).
 * This helper uses XLSX.write() -> Blob with the correct .xlsx MIME type, then triggers
 * a hidden anchor click with `download` attribute to force the correct filename.
 */
function downloadWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  const buf: ArrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after a short delay so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function formatExactDiff(wordDiff?: { type: 'equal' | 'insert' | 'delete'; text: string }[]): string {
  if (!wordDiff || wordDiff.length === 0) return 'No change';
  const addedWords: string[] = [];
  const removedWords: string[] = [];
  for (const token of wordDiff) {
    if (token.type === 'insert') addedWords.push(token.text);
    else if (token.type === 'delete') removedWords.push(token.text);
  }
  const parts: string[] = [];
  if (addedWords.length > 0) parts.push('Added: ' + addedWords.join(' ').trim());
  if (removedWords.length > 0) parts.push('Removed: ' + removedWords.join(' ').trim());
  return parts.length === 0 ? 'No change' : parts.join(' | ');
}

function formatChangeType(type: string): string {
  switch (type.toUpperCase()) {
    case 'ADDED': return 'Added';
    case 'REMOVED': return 'Removed';
    case 'MODIFIED': return 'Modified';
    case 'UNCHANGED': return 'Unchanged';
    default: return type;
  }
}

/**
 * Exports basic diff comparison data to Excel.
 * Columns: Paragraph No. | Heading | Previous Version | Current Version | Exact Diff | Change Type
 */
export function exportDiffToExcel(diffData: DiffResponse, customFilename?: string): void {
  const rows = diffData.changes.map((item) => ({
    'Paragraph No.': item.section_no,
    'Heading': item.title || item.diff_summary || ('Section ' + item.section_no),
    'Previous Version (Old Wording)': item.old_text || '(Not present in previous version)',
    'Current Version (New Wording)': item.new_text || '(Removed in current version)',
    'Exact Diff': formatExactDiff(item.word_diff),
    'Change Type': formatChangeType(item.change_type),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 16 }, // Paragraph No.
    { wch: 30 }, // Heading
    { wch: 55 }, // Old Wording
    { wch: 55 }, // New Wording
    { wch: 45 }, // Exact Diff
    { wch: 16 }, // Change Type
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Regulatory Diff');
  downloadWorkbook(workbook, customFilename || 'RegulatoryFabric_Diff_Export.xlsx');
}

/**
 * Exports verified obligations with statutory traceability to Excel.
 */
export function exportObligationsToExcel(
  obligations: Obligation[],
  filename = 'RegulatoryFabric_Obligations.xlsx'
): void {
  const rows = obligations.map((ob) => ({
    'Section No.': ob.section_no,
    'Chapter': ob.chapter_title || 'General',
    'Obligation Type': ob.obligation_type,
    'Action Required': ob.action_required,
    'Source Quote (Verbatim)': ob.source_quote,
    'Applicable Entities': ob.entities
      .map((e) => e.legal_type + ' (' + (e.applicability_type || 'DIRECT') + ')')
      .join(', '),
    'Origin': ob.origin,
    'Confidence': Math.round(ob.confidence * 100) + '%',
    'Status': ob.status,
    'Deadline': ob.deadline || 'Ongoing / Unspecified',
    'Frequency': ob.frequency || 'Ad-hoc',
    'Content Hash (SHA-256)': ob.content_hash,
    'Page': ob.page_no,
    'Paragraph': ob.paragraph_no,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 45 }, { wch: 50 },
    { wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
    { wch: 16 }, { wch: 20 }, { wch: 8 },  { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Obligations');
  downloadWorkbook(workbook, filename);
}

/**
 * Exports cross-party entity applicability matrix to Excel.
 */
export function exportMatrixToExcel(
  entities: Entity[],
  matrixRows: MatrixRow[],
  filename = 'RegulatoryFabric_Entity_Matrix.xlsx'
): void {
  const entityKeys = entities.map((e) => e.legal_type);

  const rows = matrixRows.map((row) => {
    const base: Record<string, unknown> = {
      'Obligation ID': row.obligation_id,
      'Section No.': row.section_no,
      'Chapter': row.chapter_title || 'General',
      'Obligation Type': row.obligation_type,
      'Action Required': row.action_required,
      'Origin': row.origin,
    };
    for (const key of entityKeys) {
      base[key] = row.entity_coverage[key] || 'NONE';
    }
    return base;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 45 }, { wch: 12 },
    ...entityKeys.map(() => ({ wch: 25 })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Entity Matrix');
  downloadWorkbook(workbook, filename);
}

/**
 * Exports the semantic diff comparison data (3-stage pipeline results) to Excel.
 * Columns: Paragraph No., Heading, Previous Version, Current Version,
 *          Exact Diff, Change Type, Executive Summary (AI), Compliance Action, Impact Level,
 *          Category, Affected Entities, Similarity Score, V1/V2 Section, Context, Date, Reference.
 */
export function exportSemanticDiffToExcel(
  diffData: SemanticDiffResponse,
  customFilename?: string
): void {
  const rows = diffData.paragraphs.map((item) => ({
    'Paragraph No.': item.paragraph_no,
    'Heading': item.heading,
    'Previous Version (Old Wording)': item.old_text || '(Not present in previous version)',
    'Current Version (New Wording)': item.new_text || '(Removed in current version)',
    'Exact Diff': formatExactDiff(item.word_diff),
    'Change Type': formatChangeType(item.change_type),
    'Executive Summary (AI)': item.executive_summary || '-',
    'Compliance Action': item.compliance_action || '-',
    'Impact Level': item.impact_level || 'LOW',
    'Category': item.category || '-',
    'Affected Entities': item.affected_entities.join(', ') || '-',
    'Similarity Score': item.similarity_score !== undefined
      ? Math.round(item.similarity_score * 100) + '%'
      : '-',
    'V1 Section': item.v1_section || '-',
    'V2 Section': item.v2_section || '-',
    'Section Context': item.section_context || '-',
    'Effective Date': item.effective_date || '-',
    'Reference Circular': item.reference_circular || '-',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 16 }, // Paragraph No.
    { wch: 32 }, // Heading
    { wch: 55 }, // Old Wording
    { wch: 55 }, // New Wording
    { wch: 45 }, // Exact Diff
    { wch: 16 }, // Change Type
    { wch: 55 }, // Executive Summary (AI)
    { wch: 55 }, // Compliance Action
    { wch: 14 }, // Impact Level
    { wch: 22 }, // Category
    { wch: 28 }, // Affected Entities
    { wch: 14 }, // Similarity Score
    { wch: 14 }, // V1 Section
    { wch: 14 }, // V2 Section
    { wch: 28 }, // Section Context
    { wch: 18 }, // Effective Date
    { wch: 30 }, // Reference Circular
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Semantic Diff');
  downloadWorkbook(workbook, customFilename || 'RegulatoryFabric_SemanticDiff_Export.xlsx');
}
