import React, { useEffect, useState, useRef } from 'react';
import {
  GitCompare, PlusCircle, RefreshCw, MinusCircle, ArrowRight,
  UploadCloud, FileSpreadsheet, CheckCircle2, Layers,
  ChevronRight, Brain, AlertTriangle, Shield, TrendingUp, BookOpen,
  Hash, Calendar, Building2, Eye, Diff
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { fetchSemanticDiff } from '../api';
import type { SemanticDiffResponse, SemanticDiffItem, DocumentInfo } from '../api';
import { exportSemanticDiffToExcel } from '../lib/excelExport';

interface DiffTimelineProps {
  documents?: DocumentInfo[];
  onInspectClause?: (clauseId: number) => void;
  onOpenIngestModal?: () => void;
}

// â”€â”€â”€ Impact Level helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const IMPACT_CONFIG: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
  CRITICAL: {
    label: 'CRITICAL',
    classes: 'bg-rose-600 text-white border-rose-700',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  HIGH: {
    label: 'HIGH',
    classes: 'bg-orange-500 text-white border-orange-600',
    icon: <TrendingUp className="w-3 h-3" />,
  },
  MEDIUM: {
    label: 'MEDIUM',
    classes: 'bg-amber-500 text-white border-amber-600',
    icon: <Shield className="w-3 h-3" />,
  },
  LOW: {
    label: 'LOW',
    classes: 'bg-slate-500 text-white border-slate-600',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  EDITORIAL: {
    label: 'EDITORIAL',
    classes: 'bg-slate-400 text-white border-slate-500',
    icon: <BookOpen className="w-3 h-3" />,
  },
};

// â”€â”€â”€ Change type helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getChangeBadge(type: string) {
  switch (type) {
    case 'ADDED':
      return (
        <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 gap-1 font-bold text-[11px]">
          <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>ADDED</span>
        </Badge>
      );
    case 'MODIFIED':
      return (
        <Badge className="bg-amber-50 text-amber-800 border border-amber-200 gap-1 font-bold text-[11px]">
          <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
          <span>MODIFIED</span>
        </Badge>
      );
    case 'REMOVED':
      return (
        <Badge className="bg-red-50 text-red-800 border border-red-200 gap-1 font-bold text-[11px]">
          <MinusCircle className="w-3.5 h-3.5 text-red-600" />
          <span>REMOVED</span>
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-50 text-slate-500 border border-slate-200 gap-1 font-semibold text-[11px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
          <span>UNCHANGED</span>
        </Badge>
      );
  }
}

function getChangeTypeRowStyle(type: string): string {
  switch (type) {
    case 'ADDED': return 'border-l-[3px] border-l-emerald-500';
    case 'MODIFIED': return 'border-l-[3px] border-l-amber-500';
    case 'REMOVED': return 'border-l-[3px] border-l-red-500';
    default: return 'border-l-[3px] border-l-slate-200';
  }
}

// â”€â”€â”€ Word-diff renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WordDiffRenderer({ tokens }: { tokens: SemanticDiffItem['word_diff'] }) {
  return (
    <span className="leading-relaxed font-sans text-sm">
      {tokens.map((token, idx) => {
        if (token.type === 'delete') {
          return (
            <span key={idx} className="diff-deletion">{token.text}</span>
          );
        }
        if (token.type === 'insert') {
          return (
            <span key={idx} className="diff-insertion">{token.text}</span>
          );
        }
        return <span key={idx} className="text-slate-700">{token.text}</span>;
      })}
    </span>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const DiffTimeline: React.FC<DiffTimelineProps> = ({
  documents = [],
  onInspectClause: _onInspectClause,
  onOpenIngestModal
}) => {
  const [diffData, setDiffData] = useState<SemanticDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'sidebyside' | 'diff'>('sidebyside');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'MODIFIED' | 'ADDED' | 'REMOVED' | 'UNCHANGED'>('ALL');
  const [selectedParagraphIdx, setSelectedParagraphIdx] = useState<number>(0);
  const [pipelineStage, setPipelineStage] = useState<0 | 1 | 2 | 3>(0);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Ref for the main detail viewer section — scroll here when navigator is clicked
  const detailViewRef = useRef<HTMLDivElement | null>(null);
  // Ref for the navigator's own scrollable list container
  const navigatorListRef = useRef<HTMLDivElement | null>(null);

  // Sorted documents
  const sortedDocs = [...documents].sort((a, b) => a.id - b.id);
  const [selectedV1, setSelectedV1] = useState<number>(sortedDocs[0]?.id || 1);
  const [selectedV2, setSelectedV2] = useState<number>(sortedDocs[1]?.id || sortedDocs[0]?.id || 2);

  // Sync selected versions when documents change
  useEffect(() => {
    if (documents.length >= 2) {
      const s = [...documents].sort((a, b) => a.id - b.id);
      setSelectedV1(s[0].id);
      setSelectedV2(s[1].id);
    }
  }, [documents]);

  const loadDiff = async (v1?: number, v2?: number) => {
    const targetV1 = v1 ?? selectedV1;
    const targetV2 = v2 ?? selectedV2;
    if (documents.length < 2 && !targetV1) {
      setDiffData(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setPipelineStage(1);
      await new Promise(r => setTimeout(r, 600));
      setPipelineStage(2);
      const data = await fetchSemanticDiff(targetV1, targetV2);
      setPipelineStage(3);
      await new Promise(r => setTimeout(r, 400));
      setDiffData(data);
      setSelectedParagraphIdx(0);
    } catch (err: any) {
      console.error("Error loading semantic diff", err);
      setError(err.message || "Failed to load semantic regulatory diff");
      setDiffData(null);
    } finally {
      setLoading(false);
      setPipelineStage(0);
    }
  };

  useEffect(() => {
    if (documents.length < 2) {
      setDiffData(null);
      setLoading(false);
      return;
    }
    loadDiff(selectedV1, selectedV2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedV1, selectedV2, documents.length]);

  const handleExportExcel = () => {
    if (!diffData || diffData.paragraphs.length === 0) {
      toast.error("No comparison data available to export.");
      return;
    }
    const filename = `RegulatoryFabric_SemanticDiff_Export.xlsx`;
    exportSemanticDiffToExcel(diffData, filename);
    toast.success(`Exported ${diffData.paragraphs.length} paragraphs to Excel (${filename})`);
  };

  const filteredParagraphs = diffData?.paragraphs.filter((p) => {
    if (activeFilter === 'ALL') return true;
    return p.change_type === activeFilter;
  }) ?? [];

  // Navigate paragraphs:
  // 1. Select the paragraph (do NOT reset the active filter).
  // 2. Scroll the page back up to the detail viewer so the user can see the diff.
  // 3. Keep the clicked row visible inside the navigator's own scrollable list.
  const handleNavigateTo = (globalIdx: number) => {
    setSelectedParagraphIdx(globalIdx);
    // Scroll the page to the detail viewer
    setTimeout(() => {
      detailViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
    // Also keep the selected navigator row visible within the navigator container
    setTimeout(() => {
      const row = paragraphRefs.current[globalIdx];
      const list = navigatorListRef.current;
      if (row && list) {
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;
        const listScroll = list.scrollTop;
        const listHeight = list.clientHeight;
        if (rowTop < listScroll) {
          list.scrollTo({ top: rowTop - 8, behavior: 'smooth' });
        } else if (rowBottom > listScroll + listHeight) {
          list.scrollTo({ top: rowBottom - listHeight + 8, behavior: 'smooth' });
        }
      }
    }, 60);
  };

  // â”€â”€ Loading: pipeline animation â”€â”€
  if (loading) {
    const stages = [
      { num: 1, label: 'BREAK DOWN', sub: 'Segmenting paragraphs & generating embeddings' },
      { num: 2, label: 'MATCH', sub: 'Hungarian bipartite assignment via scipy' },
      { num: 3, label: 'SHOW DIFF', sub: 'Word-level diffs & Gemini LLM classification' },
    ];
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-xl mx-auto text-center space-y-8">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-slate-900">Intelligent Semantic Diff Engine</div>
              <div className="text-xs text-slate-500">3-stage pipeline runningâ€¦</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            {stages.map((s) => (
              <React.Fragment key={s.num}>
                <div className={`flex flex-col items-center gap-1.5 transition-all duration-500 ${pipelineStage >= s.num ? 'opacity-100' : 'opacity-30'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all duration-500 ${
                    pipelineStage > s.num
                      ? 'bg-emerald-500 border-emerald-600 text-white'
                      : pipelineStage === s.num
                      ? 'bg-blue-600 border-blue-700 text-white animate-pulse'
                      : 'bg-slate-100 border-slate-300 text-slate-400'
                  }`}>
                    {pipelineStage > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>
                  <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{s.label}</div>
                </div>
                {s.num < 3 && <div className="w-8 h-px bg-slate-300 mt-[-10px]" />}
              </React.Fragment>
            ))}
          </div>

          <p className="text-sm text-slate-500 font-medium">
            {pipelineStage === 1 && stages[0].sub}
            {pipelineStage === 2 && stages[1].sub}
            {pipelineStage === 3 && stages[2].sub}
            {pipelineStage === 0 && 'Initialising pipelineâ€¦'}
          </p>
        </div>
      </div>
    );
  }

  // â”€â”€ Error state â”€â”€
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-red-200 shadow-sm">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
              <RefreshCw className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Semantic Comparison Failed</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => loadDiff(selectedV1, selectedV2)} className="gap-1.5 text-xs font-semibold">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Pipeline</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // â”€â”€ Empty / no documents state â”€â”€
  if (!diffData || diffData.paragraphs.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-slate-200/90 shadow-sm">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-primary flex items-center justify-center mx-auto border border-blue-200">
              <GitCompare className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">No Comparison Data Available</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Semantic comparison requires at least two circular versions in the database to compute
                embedding-based paragraph matching and word-level diffs.
              </p>
            </div>
            {onOpenIngestModal && (
              <Button size="sm" onClick={onOpenIngestModal} className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 font-semibold">
                <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
                <span>Ingest Document</span>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, paragraphs } = diffData;
  const activeParagraph = paragraphs[selectedParagraphIdx] ?? paragraphs[0];
  const impactCfg = IMPACT_CONFIG[activeParagraph?.impact_level ?? 'LOW'] ?? IMPACT_CONFIG.LOW;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">

      {/* â”€â”€ Pipeline Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-6 py-4 shadow-lg border border-blue-900/40">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-800/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
              <Brain className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-tight">
                Intelligent Semantic Diff Engine
              </h2>
              <p className="text-xs text-blue-300/80 font-medium">Embeddings Â· Hungarian Matching Â· LLM Classification</p>
            </div>
          </div>

          {/* 3-step pipeline steps */}
          <div className="flex items-center gap-2 sm:gap-3">
            {[
              { n: '1', label: 'BREAK DOWN' },
              { n: '2', label: 'MATCH' },
              { n: '3', label: 'SHOW DIFF' },
            ].map((s, idx) => (
              <React.Fragment key={s.n}>
                <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] font-black text-blue-300">{s.n}.</span>
                  <span className="text-[10px] font-bold text-white/90 uppercase tracking-wide">{s.label}</span>
                </div>
                {idx < 2 && <ArrowRight className="w-3.5 h-3.5 text-blue-400/60 shrink-0 hidden sm:block" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* â”€â”€ Version Selectors + Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">Base Circular:</span>
                {documents.length >= 2 ? (
                  <Select value={String(selectedV1)} onValueChange={(val) => setSelectedV1(Number(val))}>
                    <SelectTrigger className="h-8 w-[200px] text-xs font-medium bg-white border-slate-200">
                      <SelectValue placeholder="Base circular..." />
                    </SelectTrigger>
                    <SelectContent>
                      {documents.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)} disabled={d.id === selectedV2}>
                          <span className="font-medium text-slate-800 truncate">{d.title}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs font-semibold text-slate-800">{diffData.v1_doc.title}</span>
                )}
              </div>

              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">Target Circular:</span>
                {documents.length >= 2 ? (
                  <Select value={String(selectedV2)} onValueChange={(val) => setSelectedV2(Number(val))}>
                    <SelectTrigger className="h-8 w-[200px] text-xs font-semibold text-primary bg-white border-slate-200">
                      <SelectValue placeholder="Target circular..." />
                    </SelectTrigger>
                    <SelectContent>
                      {documents.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)} disabled={d.id === selectedV1}>
                          <span className="font-semibold text-primary truncate">{d.title}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs font-bold text-primary">{diffData.v2_doc.title}</span>
                )}
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleExportExcel}
              className="h-8 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export to Excel</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Main Content: Paragraph Viewer + Summary ─────────────────────── */}
      {/* detailViewRef: scrolled to when a paragraph is selected from the navigator */}
      <div ref={detailViewRef} className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5 items-start">

        {/* â”€â”€ Left: Paragraph detail viewer â”€â”€ */}
        <div className="space-y-4">

          {/* Paragraph header */}
          {activeParagraph && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {getChangeBadge(activeParagraph.change_type)}
                <span className="text-base font-black text-slate-900">
                  Paragraph {activeParagraph.paragraph_no}
                  {activeParagraph.heading ? ` â€” ${activeParagraph.heading}` : ''}
                </span>
                {activeParagraph.changes_detected_count > 0 && activeParagraph.change_type !== 'UNCHANGED' && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    {activeParagraph.changes_detected_count} change{activeParagraph.changes_detected_count !== 1 ? 's' : ''} detected
                  </span>
                )}
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  id="view-mode-sidebyside"
                  onClick={() => setViewMode('sidebyside')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'sidebyside'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  Side by side
                </button>
                <button
                  id="view-mode-diff"
                  onClick={() => setViewMode('diff')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'diff'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Diff className="w-3 h-3" />
                  Diff
                </button>
              </div>
            </div>
          )}

          {/* Text boxes */}
          {activeParagraph && viewMode === 'sidebyside' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previous version */}
              <div className="rounded-xl border border-red-200/70 bg-red-50/30 overflow-hidden">
                <div className="px-4 py-2.5 bg-red-50 border-b border-red-200/60 flex items-center gap-2">
                  <MinusCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">Previous Version</span>
                  {activeParagraph.v1_section && (
                    <span className="ml-auto text-[10px] font-mono text-red-500 bg-red-100 px-1.5 py-0.5 rounded">Â§{activeParagraph.v1_section}</span>
                  )}
                </div>
                <div className="p-4 text-sm text-slate-700 leading-relaxed font-sans">
                  {activeParagraph.old_text ? (
                    <p>{activeParagraph.old_text}</p>
                  ) : (
                    <p className="text-slate-400 italic">No previous version â€” this provision is newly added.</p>
                  )}
                </div>
              </div>

              {/* Current version */}
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/30 overflow-hidden">
                <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200/60 flex items-center gap-2">
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Current Version</span>
                  {activeParagraph.v2_section && (
                    <span className="ml-auto text-[10px] font-mono text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">Â§{activeParagraph.v2_section}</span>
                  )}
                </div>
                <div className="p-4 text-sm text-slate-700 leading-relaxed font-sans">
                  {activeParagraph.new_text ? (
                    <p>{activeParagraph.new_text}</p>
                  ) : (
                    <p className="text-slate-400 italic">Provision removed in current version.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Diff view */}
          {activeParagraph && viewMode === 'diff' && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <Diff className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Word-Level Inline Token Diff</span>
                <span className="ml-auto text-[10px] text-slate-400 font-medium">Gemini-embedding-001 + SequenceMatcher</span>
              </div>
              <div className="p-4">
                {activeParagraph.word_diff && activeParagraph.word_diff.length > 0 ? (
                  <WordDiffRenderer tokens={activeParagraph.word_diff} />
                ) : (
                  <p className="text-sm text-slate-400 italic">No word-level diff tokens available for this paragraph.</p>
                )}
              </div>
            </div>
          )}

          {/* AI Insight Card */}
          {activeParagraph && activeParagraph.change_type !== 'UNCHANGED' && (
            <div className="rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 overflow-hidden shadow-xs">
              <div className="px-4 py-3 border-b border-blue-200/40 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-bold text-blue-900">AI Executive Insight</span>
                <div className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-black ${impactCfg.classes}`}>
                  {impactCfg.icon}
                  <span>{impactCfg.label} IMPACT</span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Executive Summary</div>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium">
                    {activeParagraph.executive_summary || 'Refinement of regulatory terminology and compliance requirements.'}
                  </p>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Compliance Action Required</div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {activeParagraph.compliance_action || 'Review internal compliance checklists and update SOPs accordingly.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {activeParagraph.category && (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {activeParagraph.category.replace(/_/g, ' ')}
                    </span>
                  )}
                  {activeParagraph.affected_entities.map((e) => (
                    <span key={e} className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Metadata pills */}
          {activeParagraph && (
            <div className="flex flex-wrap gap-2">
              {activeParagraph.effective_date && (
                <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-medium shadow-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Effective: {activeParagraph.effective_date}</span>
                </div>
              )}
              {activeParagraph.regulator && (
                <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-medium shadow-xs">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{activeParagraph.regulator}</span>
                </div>
              )}
              {activeParagraph.reference_circular && (
                <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-medium shadow-xs">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-[11px]">{activeParagraph.reference_circular}</span>
                </div>
              )}
              {activeParagraph.section_context && (
                <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-medium shadow-xs">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span>{activeParagraph.section_context}</span>
                </div>
              )}
              {activeParagraph.similarity_score > 0 && (
                <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 font-medium shadow-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  <span>Similarity: {Math.round(activeParagraph.similarity_score * 100)}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* â”€â”€ Right: Summary card â”€â”€ */}
        <div className="space-y-4">
          <Card className="border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 flex items-center gap-2.5">
              <GitCompare className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-white">Change Summary</span>
            </div>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Total Paragraphs</span>
                  <span className="text-lg font-black text-slate-900">{summary.total_paragraphs}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full transition-all duration-700"
                    style={{ width: `${summary.changed_percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-lg font-black text-amber-700">{summary.changed_count}</div>
                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Changed</div>
                    <div className="text-[10px] text-amber-500">{summary.changed_percentage}%</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-lg font-black text-slate-600">{summary.unchanged_count}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">No Change</div>
                    <div className="text-[10px] text-slate-400">{summary.unchanged_percentage}%</div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  {[
                    { label: 'Added', count: summary.added_count, color: 'text-emerald-600', bg: 'bg-emerald-100' },
                    { label: 'Removed', count: summary.removed_count, color: 'text-red-600', bg: 'bg-red-100' },
                    { label: 'Modified', count: summary.modified_count, color: 'text-amber-700', bg: 'bg-amber-100' },
                  ].map(({ label, count, color, bg }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">{label}</span>
                      <span className={`text-xs font-black ${color} ${bg} px-2 py-0.5 rounded-full`}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filter widget */}
          <Card className="border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Filter Paragraphs</span>
            </div>
            <CardContent className="p-3 space-y-1.5">
              {(['ALL', 'MODIFIED', 'ADDED', 'REMOVED', 'UNCHANGED'] as const).map((f) => {
                const count = f === 'ALL'
                  ? paragraphs.length
                  : paragraphs.filter(p => p.change_type === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      activeFilter === f
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>{f === 'ALL' ? 'All Paragraphs' : f.charAt(0) + f.slice(1).toLowerCase()}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                      activeFilter === f ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>{count}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* â”€â”€ Bottom: Paragraph Navigator Accordion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-bold text-white">Paragraph Navigator</span>
            <span className="text-[10px] font-bold text-slate-400 bg-white/10 px-2 py-0.5 rounded-full">
              {filteredParagraphs.length} paragraph{filteredParagraphs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Click to focus & compare</span>
        </div>

        <div ref={navigatorListRef} className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
          {filteredParagraphs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400 font-medium">
              No paragraphs match the "{activeFilter}" filter.
            </div>
          ) : (
            filteredParagraphs.map((para, idx) => {
              // Map filtered idx back to global idx for scrolling
              const globalIdx = paragraphs.indexOf(para);
              const isActive = selectedParagraphIdx === globalIdx;

              return (
                <div
                  key={`${para.paragraph_no}-${idx}`}
                  ref={(el) => { paragraphRefs.current[globalIdx] = el; }}
                  onClick={() => handleNavigateTo(globalIdx)}
                  className={`group flex items-start gap-3.5 px-5 py-3.5 cursor-pointer transition-all ${
                    getChangeTypeRowStyle(para.change_type)
                  } ${
                    isActive
                      ? 'bg-blue-50/70 shadow-sm'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {getChangeBadge(para.change_type)}
                      <span className="text-xs font-black text-slate-900 font-mono">{para.paragraph_no}</span>
                      <span className="text-xs font-semibold text-slate-700 truncate">{para.heading}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {para.changes_detected_count > 0 && para.change_type !== 'UNCHANGED' && (
                        <span className="text-[10px] text-amber-600 font-bold">
                          {para.changes_detected_count} change{para.changes_detected_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {para.impact_level && para.change_type !== 'UNCHANGED' && (
                        <span className={`text-[10px] font-bold px-1.5 py-px rounded ${IMPACT_CONFIG[para.impact_level]?.classes ?? ''}`}>
                          {para.impact_level}
                        </span>
                      )}
                      {para.category && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {para.category.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                  }`}>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};

