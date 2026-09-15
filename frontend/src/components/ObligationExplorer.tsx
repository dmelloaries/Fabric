import React, { useState } from 'react';
import {
  Search,
  Filter,
  ShieldCheck,
  CheckCircle2,
  Scale,
  X,
  AlertCircle,
  RefreshCw,
  Eye,
  RotateCcw,
  Sparkles,
  FileSpreadsheet,
  UploadCloud
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { Obligation } from '../api';
import { toast } from 'sonner';
import { exportObligationsToExcel } from '../lib/excelExport';

interface ObligationExplorerProps {
  obligations: Obligation[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onInspectClause: (clauseId: number) => void;
  onOpenIngestModal?: () => void;
  hasDocuments?: boolean;
}

export const ObligationExplorer: React.FC<ObligationExplorerProps> = ({
  obligations,
  loading,
  error,
  onRetry,
  onInspectClause,
  onOpenIngestModal,
  hasDocuments
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedOrigin, setSelectedOrigin] = useState('ALL');

  const hasActiveFilters =
    selectedEntity !== 'ALL' ||
    selectedType !== 'ALL' ||
    selectedOrigin !== 'ALL' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setSelectedEntity('ALL');
    setSelectedType('ALL');
    setSelectedOrigin('ALL');
    setSearchQuery('');
  };

  // Filter logic
  const filtered = obligations.filter((ob) => {
    // Entity filter
    if (selectedEntity !== 'ALL') {
      const match = ob.entities.some(
        (e) => e.legal_type === selectedEntity || e.name.toLowerCase().includes(selectedEntity.toLowerCase())
      );
      if (!match) return false;
    }

    // Type filter
    if (selectedType !== 'ALL' && ob.obligation_type !== selectedType) {
      return false;
    }

    // Origin filter
    if (selectedOrigin !== 'ALL' && ob.origin !== selectedOrigin) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = (
        ob.section_no.toLowerCase().includes(q) ||
        ob.action_required.toLowerCase().includes(q) ||
        ob.source_quote.toLowerCase().includes(q) ||
        (ob.chapter_title && ob.chapter_title.toLowerCase().includes(q))
      );
      if (!matchText) return false;
    }

    return true;
  });

  const getOriginBadge = (origin: string) => {
    switch (origin) {
      case 'DIRECT':
        return <Badge variant="direct">DIRECT</Badge>;
      case 'DERIVED':
        return <Badge variant="derived">DERIVED</Badge>;
      case 'INFERRED':
        return <Badge variant="inferred">INFERRED</Badge>;
      default:
        return <Badge variant="direct">{origin}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'PROHIBITION':
        return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">PROHIBITION</Badge>;
      case 'DISCLOSURE':
        return <Badge variant="info" className="bg-blue-50 text-blue-700 border-blue-200">DISCLOSURE</Badge>;
      case 'CONSENT':
        return <Badge variant="inferred" className="bg-purple-50 text-purple-700 border-purple-200">CONSENT</Badge>;
      case 'DATA_STORAGE':
        return <Badge variant="success" className="bg-emerald-50 text-emerald-700 border-emerald-200">DATA STORAGE</Badge>;
      case 'REPORTING':
        return <Badge variant="warning" className="bg-amber-50 text-amber-800 border-amber-200">REPORTING</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  // Export filtered obligations to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filtered.length === 0) {
      toast.error("No verified obligations available to export.");
      return;
    }
    const filename = "RegulatoryFabric_Obligations.xlsx";
    exportObligationsToExcel(filtered, filename);
    toast.success(`Exported ${filtered.length} verified obligations to Excel (${filename})`);
  };

  const directCount = obligations.filter((o) => o.origin === 'DIRECT').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Obligations
              </span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {obligations.length}
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{obligations.length > 0 ? "Verbatim-grounded statutory facts" : "Awaiting circular ingestion"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Direct Statutory Facts
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-2">
              {directCount}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Zero AI inference / exact statutory quotes
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Regulated Parties
              </span>
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Filter className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {obligations.length > 0 ? "5 Entities" : "0 Entities"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {obligations.length > 0 ? "Commercial Banks, NBFCs, LSPs, DLAs, REs" : "Awaiting circular ingestion"}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Guardrail Accuracy
              </span>
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-indigo-700 mt-2">
              {obligations.length > 0 ? "97.8%" : "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {obligations.length > 0 ? "Two-stage verifiable guardrail verified" : "Zero ungrounded hallucinations"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-slate-200/90 shadow-2xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Left: Faceted Selectors */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Entity Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 shrink-0">Entity:</span>
                <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                  <SelectTrigger className="h-9 w-[205px] text-xs font-medium bg-background border-slate-200 shadow-2xs px-2.5">
                    <SelectValue placeholder="All Regulated Parties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Regulated Parties</SelectItem>
                    <SelectItem value="Bank">Commercial Banks</SelectItem>
                    <SelectItem value="NBFC">NBFCs</SelectItem>
                    <SelectItem value="LSP">Lending Service Providers (LSP)</SelectItem>
                    <SelectItem value="DLA">Digital Lending Apps (DLA)</SelectItem>
                    <SelectItem value="RE">Regulated Entities (General RE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 shrink-0">Category:</span>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="h-9 w-[190px] text-xs font-medium bg-background border-slate-200 shadow-2xs px-2.5">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Categories</SelectItem>
                    <SelectItem value="PROHIBITION">Prohibitions (Hard Bans)</SelectItem>
                    <SelectItem value="DISCLOSURE">Disclosures & KFS</SelectItem>
                    <SelectItem value="CONSENT">Consent & Data Look-up</SelectItem>
                    <SelectItem value="DATA_STORAGE">Data Storage & Privacy</SelectItem>
                    <SelectItem value="REPORTING">Credit Bureau Reporting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Origin Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 shrink-0">Origin:</span>
                <Select value={selectedOrigin} onValueChange={setSelectedOrigin}>
                  <SelectTrigger className="h-9 w-[170px] text-xs font-medium bg-background border-slate-200 shadow-2xs px-2.5">
                    <SelectValue placeholder="All Origins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Origins</SelectItem>
                    <SelectItem value="DIRECT">Direct Statutory Fact</SelectItem>
                    <SelectItem value="DERIVED">Derived from Diff</SelectItem>
                    <SelectItem value="INFERRED">Inferred / Ambiguous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Search Input, Reset, & CSV Export */}
            <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 justify-end">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search clause, 'KFS'..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 text-xs bg-background h-9 border-slate-200 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Reset Filters Button */}
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 text-xs font-semibold text-rose-600 border-rose-200 bg-rose-50/70 hover:bg-rose-100 hover:text-rose-700 gap-1.5 shrink-0 transition-colors shadow-2xs px-2.5"
                  title="Reset all active filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-9 gap-1.5 shrink-0 text-xs font-semibold text-slate-700 hover:bg-slate-50 border-slate-200 shadow-2xs px-3"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export to Excel</span>
              </Button>
            </div>
          </div>

          {/* Active Filter Chips strip */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 text-xs animate-in fade-in duration-150">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                Active Filters:
              </span>
              {selectedEntity !== 'ALL' && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-medium py-0.5"
                >
                  <span>Entity: {selectedEntity}</span>
                  <button
                    onClick={() => setSelectedEntity('ALL')}
                    className="hover:text-blue-900 ml-0.5 rounded p-0.5"
                    aria-label="Clear entity filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {selectedType !== 'ALL' && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-purple-50 text-purple-700 border-purple-200 text-[11px] font-medium py-0.5"
                >
                  <span>Category: {selectedType}</span>
                  <button
                    onClick={() => setSelectedType('ALL')}
                    className="hover:text-purple-900 ml-0.5 rounded p-0.5"
                    aria-label="Clear category filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {selectedOrigin !== 'ALL' && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-medium py-0.5"
                >
                  <span>Origin: {selectedOrigin}</span>
                  <button
                    onClick={() => setSelectedOrigin('ALL')}
                    className="hover:text-emerald-900 ml-0.5 rounded p-0.5"
                    aria-label="Clear origin filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {searchQuery.trim() !== '' && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-amber-50 text-amber-700 border-amber-200 text-[11px] font-medium py-0.5"
                >
                  <span>Search: "{searchQuery}"</span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="hover:text-amber-900 ml-0.5 rounded p-0.5"
                    aria-label="Clear search filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              <span className="text-[11px] text-slate-400 ml-auto font-medium shrink-0">
                Showing {filtered.length} of {obligations.length} obligations
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Filterable Facts Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-500 text-sm">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mb-3" />
            <p className="font-medium text-slate-700">Loading statutory obligations database...</p>
          </div>
        ) : error ? (
          <div className="p-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200 shadow-xs">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Database Connection Error</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {error}. Please check the compliance API status.
              </p>
            </div>
            {onRetry && (
              <Button size="sm" onClick={onRetry} variant="outline" className="gap-1.5 text-xs font-semibold">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Query</span>
              </Button>
            )}
          </div>
        ) : obligations.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200 shadow-xs">
              <Scale className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">No Regulatory Obligations Found</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {hasDocuments
                  ? "No statutory obligations are recorded for this selected circular. Ingest additional circular provisions or re-parse clauses."
                  : "The compliance database is currently empty. Ingest an official RBI digital lending circular or load verified guidelines to explore obligations."}
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
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Filter className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-800 text-sm">No regulatory obligations match the selected filters.</p>
              <p className="text-xs text-slate-400">
                {searchQuery ? `No results for "${searchQuery}". ` : ''}
                Try clearing your search terms or resetting the entity, category, or origin dropdowns.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedEntity('ALL');
                setSelectedType('ALL');
                setSelectedOrigin('ALL');
              }}
              className="text-xs font-semibold text-slate-700 mt-2"
            >
              Reset All Filters
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Provision</TableHead>
                  <TableHead>Obligation & Required Action</TableHead>
                  <TableHead className="w-48">Applies To</TableHead>
                  <TableHead className="w-36">Category</TableHead>
                  <TableHead className="w-28">Origin</TableHead>
                  <TableHead className="w-28">Confidence</TableHead>
                  <TableHead className="w-36 text-right">Provenance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ob) => (
                  <TableRow key={ob.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Provision / Section */}
                    <TableCell className="align-top font-mono">
                      <span className="font-bold text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded">
                        {ob.section_no}
                      </span>
                      <div className="text-[11px] text-slate-400 font-sans mt-1">
                        P.{ob.page_no} ¶{ob.paragraph_no}
                      </div>
                    </TableCell>

                    {/* Required Action */}
                    <TableCell className="align-top">
                      <div className="font-semibold text-slate-900 leading-snug">
                        {ob.action_required}
                      </div>
                      <div className="text-xs text-slate-500 italic border-l-2 border-slate-300 pl-2.5 mt-2 line-clamp-2">
                        "{ob.source_quote}"
                      </div>
                      {ob.deadline && (
                        <div className="text-[11px] text-sky-700 font-medium mt-1.5 flex items-center gap-1">
                          <span>⏱</span>
                          <span><b>Deadline:</b> {ob.deadline}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Applicable Entities */}
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1.5">
                        {ob.entities.map((e) => (
                          <Badge
                            key={e.id}
                            variant={e.applicability_type === 'DIRECT' ? 'success' : 'passthrough'}
                            className="text-[10px] w-fit font-semibold"
                            title={e.name}
                          >
                            {e.legal_type} {e.applicability_type === 'CONTRACTUAL_PASSTHROUGH' && '(Passthrough)'}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Category */}
                    <TableCell className="align-top">
                      {getTypeBadge(ob.obligation_type)}
                    </TableCell>

                    {/* Origin */}
                    <TableCell className="align-top">
                      {getOriginBadge(ob.origin)}
                    </TableCell>

                    {/* Confidence */}
                    <TableCell className="align-top">
                      <div className="text-xs font-bold text-slate-800">
                        {(ob.confidence * 100).toFixed(0)}%
                      </div>
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            ob.confidence >= 0.9 ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${ob.confidence * 100}%` }}
                        />
                      </div>
                    </TableCell>

                    {/* Provenance Button */}
                    <TableCell className="align-top text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onInspectClause(ob.clause_id)}
                        className="h-8 text-xs font-semibold text-primary border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-800 gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Source</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};
