import React from 'react';
import { GitCompare, LayoutGrid, FolderTree, AlertOctagon, BookOpen, UploadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { DocumentInfo } from '../api';

interface HeaderProps {
  documents: DocumentInfo[];
  selectedDocId?: number | null;
  onSelectDoc: (id: number) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  reviewCount: number;
  onOpenIngestModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  documents,
  selectedDocId,
  onSelectDoc,
  activeTab,
  onTabChange,
  reviewCount,
  onOpenIngestModal
}) => {
  const tabs = [
    { id: 'explorer', label: 'Obligation Explorer', icon: BookOpen },
    { id: 'diff', label: 'Diff & Timeline', icon: GitCompare },
    { id: 'matrix', label: 'Entity Matrix', icon: LayoutGrid },
    { id: 'hierarchy', label: 'Hierarchy Tree', icon: FolderTree },
    {
      id: 'review',
      label: 'Review Queue',
      icon: AlertOctagon,
      badge: reviewCount > 0 ? reviewCount : undefined
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all shadow-xs">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3.5">
          <img
            src="/logo.png"
            alt="RegulatoryFabric Logo"
            className="w-10 h-10 rounded-xl shadow-xs border border-slate-200/90 object-contain bg-white"
          />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-950">
                RegulatoryFabric
              </h1>
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 font-bold tracking-wide text-[10px] px-2 py-0.5">
                RBI DIGITAL LENDING COMPLIANCE
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-medium tracking-tight">
              Verifiable Regulatory Obligation & Change Explorer with Source Traceability
            </p>
          </div>
        </div>

        {/* Right Info: Circular Selector & Engine Status */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Circular Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Circular:</span>
            {documents.length === 0 ? (
              <div className="h-8 px-3 rounded-md border border-slate-200 bg-slate-100 text-xs text-slate-400 flex items-center font-medium">
                No circulars loaded
              </div>
            ) : (
              <Select
                value={selectedDocId ? String(selectedDocId) : undefined}
                onValueChange={(val) => onSelectDoc(Number(val))}
              >
                <SelectTrigger className="h-8 w-[260px] sm:w-[320px] text-xs font-medium bg-white border-slate-200 shadow-2xs">
                  <SelectValue placeholder="Select circular..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      <div className="flex flex-col text-left py-0.5">
                        <span className="font-semibold text-slate-900 truncate">{d.title}</span>
                        <span className="text-[10px] text-slate-400">
                          {d.issue_date.split(',')[1]?.trim() || d.issue_date} • {d.circular_no || 'RBI Circular'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Ingest Document Button (Layer 5) */}
          <Button
            onClick={onOpenIngestModal}
            size="sm"
            className="h-8 bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 shadow-xs font-semibold px-3"
          >
            <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
            <span>Ingest Document</span>
          </Button>
        </div>
      </div>

      {/* 5-Tab Navigation Bar */}
      <div className="border-t border-slate-200/80 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`group relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-0 border-b-2 outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 select-none ${
                  isActive
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
                style={{
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderTop: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                }}
              >
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
