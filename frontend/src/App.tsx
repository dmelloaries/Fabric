import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ObligationExplorer } from './components/ObligationExplorer';
import { DiffTimeline } from './components/DiffTimeline';
import { EntityMatrix } from './components/EntityMatrix';
import { HierarchyTree } from './components/HierarchyTree';
import { ReviewQueue } from './components/ReviewQueue';
import { TraceabilityDrawer } from './components/TraceabilityDrawer';
import { IngestModal } from './components/IngestModal';
import { Button } from '@/components/ui/button';
import { Toaster, toast } from '@/components/ui/sonner';
import { UploadCloud, AlertCircle, RefreshCw } from 'lucide-react';
import {
  fetchDocuments,
  fetchObligations,
  fetchReviewQueue,
  fetchSourceTraceability
} from './api';
import type {
  DocumentInfo,
  Obligation,
  TraceabilityData
} from './api';

export function App() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>('explorer');
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loadingObligations, setLoadingObligations] = useState<boolean>(true);
  const [obligationsError, setObligationsError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState<number>(0);

  // Ingestion Modal state
  const [isIngestModalOpen, setIsIngestModalOpen] = useState<boolean>(false);

  // Traceability Drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerData, setDrawerData] = useState<TraceabilityData | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);

  const loadObligations = async (docId?: number | null) => {
    const targetId = docId !== undefined ? docId : selectedDocId;
    if (!targetId) {
      setObligations([]);
      setLoadingObligations(false);
      setObligationsError(null);
      return;
    }
    setLoadingObligations(true);
    setObligationsError(null);
    try {
      const data = await fetchObligations({ doc_id: targetId });
      setObligations(data);
    } catch (e: any) {
      console.error("Error loading obligations", e);
      setObligations([]);
      setObligationsError(e.message || "Failed to load obligations from database.");
    } finally {
      setLoadingObligations(false);
    }
  };

  const loadReviewCount = async () => {
    try {
      const queue = await fetchReviewQueue();
      setReviewCount(queue.length);
    } catch (e) {
      console.warn("Could not fetch review count", e);
      setReviewCount(0);
    }
  };

  const init = async () => {
    setBackendError(null);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
      if (docs.length > 0) {
        setSelectedDocId(docs[0].id);
        await loadObligations(docs[0].id);
      } else {
        setSelectedDocId(null);
        setObligations([]);
        setLoadingObligations(false);
      }
      await loadReviewCount();
    } catch (err: any) {
      console.error("Initialization error:", err);
      setBackendError(err.message || "Could not connect to regulatory compliance database backend.");
      setDocuments([]);
      setSelectedDocId(null);
      setObligations([]);
      setLoadingObligations(false);
    }
  };

  // Initial load
  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectDoc = (id: number) => {
    setSelectedDocId(id);
    loadObligations(id);
  };

  const handleInspectClause = async (clauseId: number) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const data = await fetchSourceTraceability(clauseId);
      setDrawerData(data);
    } catch (e) {
      console.error("Error loading traceability", e);
      toast.error("Failed to load statutory traceability data.");
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleIngestSuccess = async (newDocId: number) => {
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
      setSelectedDocId(newDocId);
      await loadObligations(newDocId);
      await loadReviewCount();
      setActiveTab('explorer');
      toast.success("Document successfully parsed, verified, and loaded into Explorer!");
    } catch (e) {
      console.error("Error refreshing after ingestion", e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Toast Notification Container */}
      <Toaster richColors position="top-right" closeButton />

      {/* Institutional Top Navbar */}
      <Header
        documents={documents}
        selectedDocId={selectedDocId}
        onSelectDoc={handleSelectDoc}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        reviewCount={reviewCount}
        onOpenIngestModal={() => setIsIngestModalOpen(true)}
      />

      {/* Backend Connection Error Banner */}
      {backendError && (
        <div className="bg-red-900 text-white py-3 px-4 sm:px-6 lg:px-8 shadow-sm border-b border-red-800">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
              <span className="font-semibold text-red-200">Compliance Engine Connection Error:</span>
              <span className="text-red-100">{backendError}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={init}
              className="h-7 text-[11px] bg-white/10 hover:bg-white/20 text-white border-white/20 font-semibold gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </Button>
          </div>
        </div>
      )}

      {/* Database Empty Banner (Only when not loading and 0 documents and no backend error) */}
      {!loadingObligations && !backendError && documents.length === 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-3 px-4 sm:px-6 lg:px-8 shadow-sm border-b border-indigo-900/50">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-semibold text-amber-200">Compliance Database Empty:</span>
              <span className="text-slate-300">
                No regulatory circulars or statutory obligations are currently loaded.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setIsIngestModalOpen(true)}
                className="h-7 text-[11px] bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold gap-1.5"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Ingest Document</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content Body */}
      <main className="flex-1 pb-12">
        {activeTab === 'explorer' && (
          <ObligationExplorer
            obligations={obligations}
            loading={loadingObligations}
            error={obligationsError}
            onRetry={() => loadObligations()}
            onInspectClause={handleInspectClause}
            onOpenIngestModal={() => setIsIngestModalOpen(true)}
            hasDocuments={documents.length > 0}
          />
        )}

        {activeTab === 'diff' && (
          <DiffTimeline
            documents={documents}
            onInspectClause={handleInspectClause}
            onOpenIngestModal={() => setIsIngestModalOpen(true)}
          />
        )}

        {activeTab === 'matrix' && (
          <EntityMatrix
            onInspectClause={handleInspectClause}
            onOpenIngestModal={() => setIsIngestModalOpen(true)}
            hasDocuments={documents.length > 0}
          />
        )}

        {activeTab === 'hierarchy' && (
          <HierarchyTree
            selectedDocId={selectedDocId}
            documents={documents}
            onInspectClause={handleInspectClause}
            onOpenIngestModal={() => setIsIngestModalOpen(true)}
          />
        )}

        {activeTab === 'review' && (
          <ReviewQueue
            onInspectClause={handleInspectClause}
            onRefreshObligations={() => {
              loadObligations();
              loadReviewCount();
            }}
            onOpenIngestModal={() => setIsIngestModalOpen(true)}
            totalObligations={documents.length === 0 ? 0 : (obligations.length || 1)}
          />
        )}
      </main>

      {/* Layer 5 Ingestion Modal */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onSuccess={handleIngestSuccess}
      />

      {/* Universal Source Traceability Drawer */}
      <TraceabilityDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        data={drawerData}
        loading={drawerLoading}
      />


      {/* Institutional Footer */}
      <footer className="mt-auto border-t border-slate-200/80 bg-white py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="RegulatoryFabric" className="w-4 h-4 rounded object-contain border border-slate-200/80" />
            <span className="font-bold text-slate-800">RegulatoryFabric Compliance Engine</span>
            <span>•</span>
            <span>RBI Digital Lending Guidelines Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
