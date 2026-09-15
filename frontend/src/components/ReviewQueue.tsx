import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, ShieldAlert, Eye, Check, CheckCircle2, UploadCloud, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { fetchReviewQueue, submitReviewAction } from '../api';
import type { ReviewQueueItem } from '../api';

interface ReviewQueueProps {
  onInspectClause?: (clauseId: number) => void;
  onRefreshObligations?: () => void;
  onOpenIngestModal?: () => void;
  totalObligations?: number;
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({
  onInspectClause,
  onRefreshObligations,
  onOpenIngestModal,
  totalObligations = 0
}) => {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<Record<number, string>>({});

  const loadQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchReviewQueue();
      setQueue(data);
    } catch (e: any) {
      console.error("Failed to load review queue", e);
      setError(e.message || "Failed to load review queue");
      setQueue([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleAction = async (id: number, action: string) => {
    try {
      const ok = await submitReviewAction(id, action);
      if (ok) {
        setActionSuccess((prev) => ({ ...prev, [id]: action }));
        if (action === 'APPROVE') {
          toast.success("Obligation approved and verified into Explorer!");
        } else if (action === 'REJECT') {
          toast.info("Obligation rejected and removed from review queue.");
        } else {
          toast.success(`Action "${action}" submitted.`);
        }
        setTimeout(() => {
          setQueue((prev) => prev.filter((item) => item.id !== id));
          if (onRefreshObligations) onRefreshObligations();
        }, 1200);
      }
    } catch (e: any) {
      console.error("Error executing review action", e);
      toast.error(e.message || "Failed to submit review action.");
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-3" />
        <p className="text-sm font-medium">Loading compliance review queue...</p>
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
                Failed to Load Compliance Review Queue
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {error}. Please check backend service connectivity.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadQueue}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading Queue</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner */}
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Compliance Review Queue (Human-in-the-Loop)
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Isolates ambiguous provisions and extractions with confidence &lt; 85% to prevent unsupported conclusions
                </p>
              </div>
            </div>

            <Badge variant="flagged" className="px-3 py-1 text-xs font-bold gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{queue.length} Pending Review Items</span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      {queue.length === 0 ? (
        totalObligations === 0 ? (
          <Card className="border-slate-200/90 shadow-sm">
            <CardContent className="py-20 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-base font-bold text-slate-950">
                  Compliance Review Queue Empty
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  No statutory obligations are currently loaded in the database. When documents are ingested, the human-in-the-loop review station automatically isolates ambiguous clauses and extractions with confidence &lt; 85%.
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
        ) : (
          <Card className="border-slate-200/90 shadow-sm">
            <CardContent className="py-20 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-950">
                Review Queue Clean!
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                All extracted statutory obligations have passed the Two-Stage Grounding Guardrail (&gt; 85% confidence score with verifiable character substrings).
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="space-y-4">
          {queue.map((item) => {
            const isResolved = !!actionSuccess[item.id];
            return (
              <Card
                key={item.id}
                className={`overflow-hidden border transition-all ${
                  isResolved
                    ? 'border-emerald-300 bg-emerald-50/20 opacity-70'
                    : 'border-amber-200/90 hover:shadow-md'
                }`}
              >
                {/* Card Header with Flag Reason */}
                <div
                  className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
                    isResolved
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className={`w-4 h-4 ${isResolved ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <span className="font-mono font-bold text-xs bg-white/90 px-2 py-0.5 rounded border border-amber-200">
                      {item.section_no} • Page {item.page_no}
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-white text-amber-800 border-amber-300 font-bold">
                      Confidence: {(item.confidence * 100).toFixed(0)}% (Flagged)
                    </Badge>
                  </div>

                  <div className="text-xs font-semibold">
                    Origin: <span className="font-bold">{item.origin}</span>
                  </div>
                </div>

                {/* Flag Reason Banner */}
                <div className="px-5 py-2.5 bg-amber-100/50 border-b border-amber-200/70 text-xs font-medium text-amber-950 flex items-center gap-1.5">
                  <span className="font-bold">Reason Flagged:</span>
                  <span>{item.flag_reason}</span>
                </div>

                {/* Side-by-Side Review Grid */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Left: Raw Statutory Text */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Official Circular Raw Text
                    </div>
                    <div className="p-4 bg-slate-50/90 border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-800 font-serif">
                      {item.raw_text}
                    </div>
                  </div>

                  {/* Right: Model Proposed Extraction */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Proposed Structured Extraction
                    </div>
                    <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Action Required:
                        </span>
                        <div className="font-semibold text-xs text-slate-950 mt-0.5">
                          {item.action_required}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Category:
                          </span>
                          <div className="font-bold text-primary mt-0.5">
                            {item.obligation_type}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Entities:
                          </span>
                          <div className="font-bold text-emerald-700 mt-0.5">
                            {item.entities.join(', ')}
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Verbatim Quote:
                        </span>
                        <div className="text-xs text-slate-600 italic border-l-2 border-slate-300 pl-2 mt-1">
                          "{item.source_quote}"
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between">
                  {onInspectClause ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInspectClause(item.clause_id)}
                      className="gap-1.5 text-xs text-slate-700 bg-white"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Inspect Provenance</span>
                    </Button>
                  ) : <div />}

                  {isResolved ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
                      <Check className="w-4 h-4" />
                      <span>Action Applied: {actionSuccess[item.id]}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleAction(item.id, 'REJECT')}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject Fact</span>
                      </Button>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleAction(item.id, 'APPROVE')}
                        className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve Extraction</span>
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
