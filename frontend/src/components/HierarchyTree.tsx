import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText, Eye, Compass, BookOpen, Layers, UploadCloud, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchHierarchy } from '../api';
import type { HierarchyChapter, DocumentInfo } from '../api';

interface HierarchyTreeProps {
  selectedDocId?: number | null;
  documents?: DocumentInfo[];
  onInspectClause: (clauseId: number) => void;
  onOpenIngestModal?: () => void;
}

interface SelectedClauseState {
  id: number;
  section_no: string;
  clause_title?: string;
  page_no: number;
  paragraph_no: number;
  obligations_count: number;
  chapter_no?: string;
  chapter_title?: string;
  section_title?: string;
}

export const HierarchyTree: React.FC<HierarchyTreeProps> = ({
  selectedDocId,
  documents,
  onInspectClause,
  onOpenIngestModal
}) => {
  const [chapters, setChapters] = useState<HierarchyChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [selectedClause, setSelectedClause] = useState<SelectedClauseState | null>(null);

  const loadHierarchy = async () => {
    if (!selectedDocId || (documents && documents.length === 0)) {
      setChapters([]);
      setSelectedClause(null);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchHierarchy(selectedDocId);
      setChapters(data);
      // Expand all by default
      const initExpand: Record<string, boolean> = {};
      data.forEach((c) => {
        initExpand[c.chapter_no] = true;
      });
      setExpandedChapters(initExpand);
      // Select first clause if available
      if (data[0]?.sections[0]?.clauses[0]) {
        setSelectedClause({
          ...data[0].sections[0].clauses[0],
          chapter_title: data[0].chapter_title,
          chapter_no: data[0].chapter_no,
          section_title: data[0].sections[0].section_title
        });
      } else {
        setSelectedClause(null);
      }
    } catch (e: any) {
      console.error("Failed to load hierarchy", e);
      setError(e.message || "Failed to load document hierarchy");
      setChapters([]);
      setSelectedClause(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHierarchy();
  }, [selectedDocId, documents]);

  const toggleChapter = (chNo: string) => {
    setExpandedChapters((prev) => ({ ...prev, [chNo]: !prev[chNo] }));
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-3" />
        <p className="text-sm font-medium">Building document structural hierarchy tree...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-red-200 shadow-sm">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200 shadow-xs">
              <RefreshCw className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Failed to Build Structural Hierarchy
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {error}. Please verify the backend connection and try again.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadHierarchy}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Building Hierarchy</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-slate-200/90 shadow-sm">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center mx-auto border border-purple-200 shadow-xs">
              <Compass className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                No Structural Hierarchy Found
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                No chapters, sections, or clauses have been indexed for the selected circular. Ingest an RBI circular PDF or load verified guidelines to explore authentic legal numbering (Chapter → Section → Clause).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {onOpenIngestModal && (
                <Button
                  size="sm"
                  onClick={onOpenIngestModal}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 font-semibold"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ingest Document</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner Card */}
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100 shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Statutory Document Hierarchy & Structural Tree
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Preserves authentic legal numbering (Chapter → Section → Clause) and parent-child statutory relationships
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout: Tree on Left, Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Collapsible Tree */}
        <Card className="lg:col-span-6 border-slate-200/90 shadow-sm overflow-hidden flex flex-col max-h-[720px]">
          <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Circular Structural Outline</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">{chapters.length} Chapters</span>
          </div>

          <div className="p-4 overflow-y-auto space-y-2 flex-1">
            {chapters.map((ch) => {
              const isExpanded = !!expandedChapters[ch.chapter_no];
              return (
                <div key={ch.chapter_no} className="border border-slate-200/80 rounded-lg overflow-hidden bg-white shadow-2xs">
                  {/* Chapter Header */}
                  <div
                    onClick={() => toggleChapter(ch.chapter_no)}
                    className="p-3 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer flex items-center justify-between transition-colors select-none text-xs font-bold text-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <Folder className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>{ch.chapter_no}: {ch.chapter_title}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-slate-200/70 text-slate-600 font-semibold">
                      {ch.sections.length} sections
                    </Badge>
                  </div>

                  {/* Sections & Clauses */}
                  {isExpanded && (
                    <div className="p-2 space-y-2 border-t border-slate-100 bg-white">
                      {ch.sections.map((sec) => (
                        <div key={sec.section_no} className="ml-2 pl-3 border-l-2 border-slate-200 space-y-1">
                          <div className="text-[11px] font-bold text-slate-700 py-1">
                            {sec.section_no} — {sec.section_title}
                          </div>

                          <div className="space-y-1">
                            {sec.clauses.map((cl) => {
                              const isSelected = selectedClause?.id === cl.id;
                              return (
                                <div
                                  key={cl.id}
                                  onClick={() =>
                                    setSelectedClause({
                                      ...cl,
                                      chapter_no: ch.chapter_no,
                                      chapter_title: ch.chapter_title,
                                      section_title: sec.section_title
                                    })
                                  }
                                  className={`px-3 py-2 rounded-md cursor-pointer flex items-center justify-between text-xs transition-all ${
                                    isSelected
                                      ? 'bg-blue-50/90 text-primary font-semibold ring-1 ring-blue-300'
                                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate pr-2">
                                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-slate-400'}`} />
                                    <span className="truncate">{cl.clause_title || cl.section_no}</span>
                                  </div>
                                  <Badge
                                    variant={isSelected ? 'default' : 'outline'}
                                    className="text-[10px] font-semibold shrink-0"
                                  >
                                    {cl.obligations_count} {cl.obligations_count === 1 ? 'fact' : 'facts'}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right: Selected Clause Legal Context */}
        <Card className="lg:col-span-6 border-slate-200/90 shadow-sm flex flex-col justify-between">
          <CardContent className="p-6 space-y-6">
            {selectedClause ? (
              <div className="space-y-5">
                {/* Breadcrumb path */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <span>Circular</span>
                  <span>/</span>
                  <span>{selectedClause.chapter_no}</span>
                  <span>/</span>
                  <span className="text-primary font-bold">{selectedClause.section_no}</span>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-950">
                    {selectedClause.clause_title || selectedClause.section_no}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Chapter: <span className="font-semibold text-slate-700">{selectedClause.chapter_title}</span>
                  </p>
                </div>

                {/* Coordinates & Facts Grid */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Source Coordinates
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-1">
                      Official PDF Page {selectedClause.page_no}, ¶{selectedClause.paragraph_no}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Atomic Obligations
                    </div>
                    <div className="text-xs font-bold text-emerald-700 mt-1">
                      {selectedClause.obligations_count} Structured Fact(s) Extracted
                    </div>
                  </div>
                </div>

                {/* Legal Principle Callout */}
                <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-blue-950">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    <span>Hierarchical Provenance Principle</span>
                  </div>
                  <p className="text-slate-700">
                    In statutory interpretation, isolated clauses must be understood within their parent chapter context. This tree hierarchy maintains the legal lineage of each clause back to its governing section and overarching regulatory intent.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-24 text-center text-slate-500 text-sm">
                Select a clause from the hierarchy tree on the left to inspect its statutory context.
              </div>
            )}
          </CardContent>

          {selectedClause && (
            <div className="p-6 pt-0 border-t border-slate-100 flex justify-end">
              <Button
                onClick={() => onInspectClause(selectedClause.id)}
                className="gap-2 text-xs font-semibold shadow-xs"
              >
                <Eye className="w-4 h-4" />
                <span>Open in Universal Traceability Drawer</span>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
