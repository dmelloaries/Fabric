import React, { useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ArrowRight,
  ShieldCheck,
  Hash,
  Sparkles,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  fetchIngestPresets,
  ingestDocumentUpload,
  ingestDocumentUrl,
  type IngestPreset,
  type IngestResponse,
} from "../api";

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newDocId: number) => void;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"upload" | "url">("url");
  const [presets, setPresets] = useState<IngestPreset[]>([]);
  const [selectedPresetUrl, setSelectedPresetUrl] = useState<string>("");

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadVersionId, setUploadVersionId] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [urlVersionId, setUrlVersionId] = useState("");

  // Processing & result state
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepMessage, setStepMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  // Load presets on open
  useEffect(() => {
    if (isOpen) {
      fetchIngestPresets()
        .then((data) => {
          setPresets(data);
          if (data.length > 0 && !urlInput) {
            // Default to 2025 Master Direction
            const primary = data.find((p) => p.is_primary) || data[0];
            setSelectedPresetUrl(primary.url);
            setUrlInput(primary.url);
            setUrlTitle(primary.title);
            setUrlVersionId(primary.version_id);
          }
        })
        .catch((err) => console.warn("Could not load presets:", err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = (p: IngestPreset) => {
    setSelectedPresetUrl(p.url);
    setUrlInput(p.url);
    setUrlTitle(p.title);
    setUrlVersionId(p.version_id);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        setUploadedFile(file);
        setUploadTitle(file.name.replace(/\.pdf$/i, ""));
        setUploadVersionId("Upload-" + new Date().getFullYear());
        setError(null);
      } else {
        setError("Please drop a valid PDF (.pdf) document.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        setUploadedFile(file);
        setUploadTitle(file.name.replace(/\.pdf$/i, ""));
        setUploadVersionId("Upload-" + new Date().getFullYear());
        setError(null);
      } else {
        setError("Please select a valid PDF (.pdf) document.");
      }
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadedFile) {
      setError("Please select or drop a PDF file.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setStepMessage("Extracting PDF text pages & hierarchical provisions...");

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      if (uploadTitle.trim()) formData.append("title", uploadTitle.trim());
      if (uploadVersionId.trim())
        formData.append("version_id", uploadVersionId.trim());

      // Simulate stage message
      setTimeout(() => {
        setStepMessage(
          "Running Stage 1 verbatim checks & Stage 2 taxonomy validation...",
        );
      }, 1500);

      const res = await ingestDocumentUpload(formData);
      setResult(res);
      toast.success(
        `Ingestion complete! Parsed ${res.clauses_extracted} clauses (${res.verified_count} verified) across ${res.total_pages} pages.`,
      );
    } catch (err: any) {
      const msg = err.message || "An error occurred during file ingestion.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput || !urlInput.startsWith("http")) {
      setError("Please provide a valid HTTP or HTTPS document URL.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setStepMessage(
      "Connecting to regulatory portal & downloading PDF bytes...",
    );

    try {
      setTimeout(() => {
        setStepMessage(
          "Deconstructing PDF chapters, sections, and statutory clauses...",
        );
      }, 2500);

      setTimeout(() => {
        setStepMessage(
          "Executing two-stage deterministic obligation extractor...",
        );
      }, 5000);

      const res = await ingestDocumentUrl({
        url: urlInput.trim(),
        title: urlTitle.trim() || undefined,
        version_id: urlVersionId.trim() || undefined,
      });
      setResult(res);
      toast.success(
        `URL ingestion complete! Parsed ${res.clauses_extracted} clauses across ${res.total_pages} pages.`,
      );
    } catch (err: any) {
      const msg = err.message || "An error occurred during URL ingestion.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinish = () => {
    if (result) {
      onSuccess(result.document_id);
    }
    onClose();
  };

  const resetModal = () => {
    setResult(null);
    setError(null);
    setUploadedFile(null);
    setUploadTitle("");
    setUploadVersionId("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Layers className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">
                  Ingestion Pipeline
                </h3>
                <Badge className="bg-sky-500/30 text-sky-200 border-sky-400/30 text-[10px] uppercase tracking-wider">
                  Live Extraction
                </Badge>
              </div>
              <p className="text-xs text-slate-300">
                Upload or fetch RBI circulars into Cloud PostgreSQL with zero
                hallucination verification.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Result view */}
          {result ? (
            <div className="space-y-4 animate-in zoom-in-95 duration-200">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950">
                <div className="flex items-center gap-2 font-bold text-base text-emerald-800 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Ingestion & Statutory Extraction Complete!
                </div>
                <p className="text-xs text-emerald-700">
                  Document has been parsed, content-hashed, segmented, and
                  committed to PostgreSQL (Neon).
                </p>
              </div>

              {/* Stats Card */}
              <Card className="p-4 border-slate-200 bg-slate-50/50 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-xs text-slate-500 block">Pages</span>
                    <span className="text-xl font-bold text-slate-900">
                      {result.total_pages}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-xs text-slate-500 block">
                      Clauses
                    </span>
                    <span className="text-xl font-bold text-indigo-700">
                      {result.clauses_extracted}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-xs text-slate-500 block">
                      Verified
                    </span>
                    <span className="text-xl font-bold text-emerald-700">
                      {result.verified_count}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-xs text-slate-500 block">
                      Review Queue
                    </span>
                    <span className="text-xl font-bold text-amber-600">
                      {result.flagged_count}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 text-xs space-y-1 text-slate-600">
                  <div>
                    <span className="font-semibold">Title:</span> {result.title}
                  </div>
                  <div>
                    <span className="font-semibold">Circular No:</span>{" "}
                    {result.circular_no}
                  </div>
                  <div>
                    <span className="font-semibold">Version ID:</span>{" "}
                    {result.version_id}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 truncate">
                    <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{result.sha256_hash}</span>
                  </div>
                </div>
              </Card>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={resetModal}
                  className="text-xs"
                >
                  Ingest Another
                </Button>
                <Button
                  onClick={handleFinish}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5"
                >
                  Open in Obligation Explorer
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : isProcessing ? (
            /* Processing State */
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                  <ShieldCheck className="w-3 h-3 text-white" />
                </div>
              </div>

              <div className="space-y-1 max-w-sm">
                <h4 className="font-bold text-slate-900 text-base">
                  Processing Document Stream
                </h4>
                <p className="text-xs text-slate-500">{stepMessage}</p>
              </div>

              <div className="w-full max-w-xs bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-600 rounded-full animate-pulse w-3/4" />
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                Running verbatim substring & taxonomy validation
              </div>
            </div>
          ) : (
            /* Form state */
            <>
              {/* Tab Selector */}
              <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("url");
                    setError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all ${
                    activeTab === "url"
                      ? "bg-white text-slate-950 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Import from RBI Portal URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("upload");
                    setError(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all ${
                    activeTab === "upload"
                      ? "bg-white text-slate-950 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Drop / Upload PDF File</span>
                </button>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-900 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Ingestion Error</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* TAB 1: URL Import */}
              {activeTab === "url" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-2">
                      Select Verified RBI Circular Preset:
                    </label>
                    <div className="grid grid-cols-1 gap-2.5">
                      {presets.map((p) => {
                        const isSelected = selectedPresetUrl === p.url;
                        return (
                          <div
                            key={p.version_id}
                            onClick={() => handleSelectPreset(p)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer text-left flex items-start justify-between gap-3 ${
                              isSelected
                                ? "bg-sky-50/70 border-sky-400 ring-1 ring-sky-300"
                                : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/70"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">
                                  {p.title}
                                </span>
                                {p.is_primary && (
                                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold border-emerald-200">
                                    Primary Source
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 leading-normal">
                                {p.description}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 pt-0.5">
                                <span>{p.circular_no}</span>
                                <span>•</span>
                                <span>{p.version_id}</span>
                              </div>
                            </div>
                            <div className="shrink-0 pt-0.5">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  isSelected
                                    ? "border-sky-600 bg-sky-600 text-white"
                                    : "border-slate-300"
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Target PDF URL
                    </label>
                    <Input
                      type="url"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setSelectedPresetUrl("");
                      }}
                      placeholder="https://rbidocs.rbi.org.in/.../document.pdf"
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">
                        Document Title (Optional)
                      </label>
                      <Input
                        type="text"
                        value={urlTitle}
                        onChange={(e) => setUrlTitle(e.target.value)}
                        placeholder="e.g. RBI (Digital Lending) Directions, 2025"
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">
                        Version Identifier (Optional)
                      </label>
                      <Input
                        type="text"
                        value={urlVersionId}
                        onChange={(e) => setUrlVersionId(e.target.value)}
                        placeholder="e.g. 2025-Directions"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button
                      onClick={handleUrlSubmit}
                      disabled={isProcessing || !urlInput.trim()}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 px-5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      Fetch & Execute Layer 5 Ingestion
                    </Button>
                  </div>
                </div>
              )}

              {/* TAB 2: File Upload */}
              {activeTab === "upload" && (
                <div className="space-y-4">
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                      isDragOver
                        ? "border-sky-500 bg-sky-50/50 scale-[0.99]"
                        : uploadedFile
                          ? "border-emerald-400 bg-emerald-50/30"
                          : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {uploadedFile ? (
                      <>
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {uploadedFile.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
                            • Ready for Ingestion
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="text-xs mt-1"
                        >
                          Choose Different File
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                          <UploadCloud className="w-6 h-6 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            Drag & drop your RBI PDF here, or{" "}
                            <span className="text-sky-600 underline">
                              browse
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Supports RBI Master Directions, Circulars, and
                            Guidelines (.pdf)
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {uploadedFile && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">
                          Document Title
                        </label>
                        <Input
                          type="text"
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="e.g. RBI (Digital Lending) Directions, 2025"
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">
                          Version ID
                        </label>
                        <Input
                          type="text"
                          value={uploadVersionId}
                          onChange={(e) => setUploadVersionId(e.target.value)}
                          placeholder="e.g. 2025-Directions"
                          className="text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleUploadSubmit}
                      disabled={isProcessing || !uploadedFile}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 px-5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      Start Deterministic Ingestion
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
