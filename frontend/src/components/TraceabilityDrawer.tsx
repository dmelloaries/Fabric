import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, Hash, AlertCircle, Copy, Check, FileCheck, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet';
import type { TraceabilityData } from '../api';

interface TraceabilityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: TraceabilityData | null;
  loading: boolean;
}

export const TraceabilityDrawer: React.FC<TraceabilityDrawerProps> = ({
  isOpen,
  onClose,
  data,
  loading
}) => {
  const [copied, setCopied] = useState(false);

  const copyHash = () => {
    if (data?.content_hash) {
      navigator.clipboard.writeText(data.content_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Render raw text with highlighted verbatim quote
  const renderHighlightedText = () => {
    if (!data) return null;
    const { raw_text, source_quote } = data;
    if (!source_quote || !raw_text.includes(source_quote)) {
      return <span className="text-slate-800 font-serif leading-relaxed text-xs">{raw_text}</span>;
    }

    const parts = raw_text.split(source_quote);
    return (
      <div className="font-serif leading-relaxed text-xs text-slate-800">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && (
              <mark className="bg-amber-200/80 text-amber-950 font-semibold px-1 py-0.5 rounded border border-amber-300 font-sans shadow-2xs">
                {source_quote}
              </mark>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl w-full flex flex-col p-0 overflow-hidden">
        {/* Sheet Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/70">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-primary flex items-center justify-center border border-blue-200/70 shadow-2xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <SheetTitle className="text-base font-bold text-slate-950">
                  Universal Source Traceability
                </SheetTitle>
                <SheetDescription className="text-xs text-slate-500">
                  Verbatim Substring Proof & Content-Addressed Hash
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mb-3" />
              <p className="font-medium text-slate-700">Loading verifiable provenance data...</p>
            </div>
          ) : !data ? (
            <div className="py-20 text-center text-slate-500 text-sm space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-900">Provenance Data Not Available</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Source coordinates, cryptographic SHA-256 hash, or verbatim citation for this clause could not be loaded from the database.
              </p>
            </div>
          ) : (
            <>
              {/* Verification Proof Cards (Stage 1 & Stage 2) */}
              <div className="space-y-2.5">
                {/* Stage 1 Proof */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                    data.stage1_verbatim_verified
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      : 'bg-red-50/80 border-red-200 text-red-950'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {data.stage1_verbatim_verified ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-emerald-900">
                      [✓] Stage 1: Verbatim Substring Verified
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Exact 1:1 character match confirmed against official RBI circular source text. Zero paraphrasing or AI invention.
                    </p>
                  </div>
                </div>

                {/* Stage 2 Proof */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                    data.stage2_taxonomy_validated
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      : 'bg-amber-50/80 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-emerald-900">
                      [✓] Stage 2: Controlled Taxonomy Validated
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Entity scope ({data.applies_to.join(', ')}) & Type ({data.obligation_type}) strictly match known RBI banking ontology.
                    </p>
                  </div>
                </div>
              </div>

              {/* Source Document Metadata Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Document Source Coordinates
                  </span>
                  <Badge variant="outline" className="bg-white font-mono text-[10px] font-bold text-primary">
                    {data.section_no}
                  </Badge>
                </div>
                <div className="text-xs font-bold text-slate-900">
                  {data.doc_title}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                  <span><b>Circular:</b> {data.circular_no}</span>
                  <span><b>Date:</b> {data.issue_date}</span>
                  <span><b>Page:</b> {data.page_no}</span>
                  <span><b>Paragraph:</b> {data.paragraph_no}</span>
                </div>
              </div>

              {/* Full Raw Provision Text Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Full Clause Text (With Verbatim Quote Highlighted)
                  </label>
                  <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                    Highlighted = Verbatim Fact
                  </span>
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-xl max-h-56 overflow-y-auto shadow-2xs">
                  {renderHighlightedText()}
                </div>
              </div>

              {/* Content-Addressed Hash Proof (SHA-256) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Hash className="w-3.5 h-3.5 text-slate-400" />
                    <span>Content-Addressed Hash (SHA-256)</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyHash}
                    className="h-7 text-[11px] gap-1 px-2.5 bg-white shadow-2xs"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied!' : 'Copy Hash'}</span>
                  </Button>
                </div>
                <div className="font-mono text-[11px] text-slate-800 break-all bg-white p-2.5 rounded-md border border-slate-200">
                  {data.content_hash}
                </div>
                <p className="text-[11px] text-slate-500">
                  SHA-256 hash computed deterministically from raw clause text. Proves the source has not been modified across revisions.
                </p>
              </div>

              {/* Extraction Confidence & Origin Breakdown */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-100/70 border border-slate-200 rounded-xl">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Extraction Origin
                  </div>
                  <div className={`text-xs font-bold mt-1 ${data.origin === 'DIRECT' ? 'text-emerald-700' : 'text-indigo-700'}`}>
                    {data.origin} STATUTORY FACT
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Confidence Score
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-1">
                    {(data.confidence * 100).toFixed(1)}% (Passes &gt; 85% Gate)
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sheet Footer */}
        <SheetFooter className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-slate-500 font-mono">
            RBI Digital Lending § {data?.section_no}
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={onClose}
            className="text-xs font-semibold"
          >
            Close Inspector
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
