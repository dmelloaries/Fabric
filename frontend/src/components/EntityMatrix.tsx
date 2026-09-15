import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, Minus, FileSpreadsheet, LayoutGrid, UploadCloud, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { fetchEntityMatrix } from '../api';
import type { MatrixRow, Entity } from '../api';
import { exportMatrixToExcel } from '../lib/excelExport';

interface EntityMatrixProps {
  onInspectClause?: (clauseId: number) => void;
  onOpenIngestModal?: () => void;
  hasDocuments?: boolean;
}

export const EntityMatrix: React.FC<EntityMatrixProps> = ({
  onOpenIngestModal,
  hasDocuments
}) => {
  const [matrixData, setMatrixData] = useState<{ entities: Entity[]; rows: MatrixRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatrix = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEntityMatrix();
      setMatrixData(data);
    } catch (e: any) {
      console.error("Failed to load entity matrix", e);
      setError(e.message || "Failed to compile entity matrix");
      setMatrixData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrix();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-3" />
        <p className="text-sm font-medium">Compiling cross-party entity applicability matrix...</p>
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
                Failed to Load Entity Matrix
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {error}. Please check backend service connectivity.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadMatrix}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Matrix Compilation</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!matrixData || matrixData.rows.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-slate-200/90 shadow-sm">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto border border-indigo-200 shadow-xs">
              <LayoutGrid className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                No Entity Applicability Data
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {hasDocuments
                  ? "No mapped obligations were found for regulated entities. Try ingesting circular documents with entity accountability clauses."
                  : "The compliance database is currently empty. Ingest an official RBI digital lending circular or load verified guidelines to generate the cross-party applicability matrix."}
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

  const renderCell = (status: string) => {
    if (status === 'DIRECT') {
      return (
        <Badge variant="direct" className="gap-1 font-bold text-[10px]">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>DIRECT</span>
        </Badge>
      );
    } else if (status === 'CONTRACTUAL_PASSTHROUGH') {
      return (
        <Badge variant="passthrough" className="gap-1 font-bold text-[10px]">
          <ShieldAlert className="w-3 h-3 text-amber-600" />
          <span>PASSTHROUGH</span>
        </Badge>
      );
    } else {
      return <Minus className="w-4 h-4 text-slate-300 mx-auto" />;
    }
  };

  const handleExportExcel = () => {
    if (!matrixData || matrixData.rows.length === 0) {
      toast.error("No entity matrix data available to export.");
      return;
    }
    const filename = "RegulatoryFabric_Entity_Matrix.xlsx";
    exportMatrixToExcel(matrixData.entities, matrixData.rows, filename);
    toast.success(`Exported entity coverage matrix (${matrixData.rows.length} rows) to Excel (${filename})`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Legend Card */}
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 shadow-xs">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Entity Applicability & Passthrough Matrix
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Strict statutory mapping across Regulated Entities (Banks/NBFCs) and Agents (LSPs/DLAs)
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="gap-1.5 shrink-0 text-xs font-semibold text-slate-700 hover:bg-slate-50 border-slate-200"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export to Excel</span>
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
              <span className="font-bold text-emerald-800">DIRECT:</span>
              <span className="text-slate-600">Direct statutory liability established under RBI regulation</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
              <span className="font-bold text-amber-800">PASSTHROUGH:</span>
              <span className="text-slate-600">RE must contractually obligate and monitor agent compliance</span>
            </div>

            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-slate-300" />
              <span className="text-slate-500">Not Applicable (Duty not placed on entity)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matrix Table Card */}
      <Card className="overflow-hidden border-slate-200/90 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Provision</TableHead>
                <TableHead>Obligation Summary</TableHead>
                <TableHead className="w-32 text-center">Bank</TableHead>
                <TableHead className="w-32 text-center">NBFC</TableHead>
                <TableHead className="w-36 text-center">LSP (Agent)</TableHead>
                <TableHead className="w-32 text-center">DLA (App)</TableHead>
                <TableHead className="w-32 text-center">General RE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrixData.rows.map((row) => (
                <TableRow key={row.obligation_id} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-mono">
                    <span className="font-bold text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded">
                      {row.section_no}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="font-semibold text-slate-900 text-sm">{row.action_required}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Category: <span className="font-semibold text-slate-700">{row.obligation_type}</span> • Origin: <span className="font-semibold text-slate-700">{row.origin}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    {renderCell(row.entity_coverage['Bank'] || 'NONE')}
                  </TableCell>

                  <TableCell className="text-center">
                    {renderCell(row.entity_coverage['NBFC'] || 'NONE')}
                  </TableCell>

                  <TableCell className="text-center">
                    {renderCell(row.entity_coverage['LSP'] || 'NONE')}
                  </TableCell>

                  <TableCell className="text-center">
                    {renderCell(row.entity_coverage['DLA'] || 'NONE')}
                  </TableCell>

                  <TableCell className="text-center">
                    {renderCell(row.entity_coverage['RE'] || 'NONE')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
