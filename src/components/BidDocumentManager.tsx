'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Paperclip,
  ExternalLink,
  Trash2,
  FolderArchive,
  Check,
  AlertCircle,
  File,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  FolderPlus,
  Loader2,
  Download,
} from 'lucide-react';
import { uploadBidDocument } from '@/lib/uploads/uploadBidDocument';

export interface BidAttachmentItem {
  filename: string;
  size?: number;
  contentType?: string;
  storageUrl?: string;
  category?: string;
  isManualUpload?: boolean;
  uploadedAt?: string;
  [key: string]: any;
}

interface BidDocumentManagerProps {
  bidId: string;
  bidNumber?: string | null;
  projectName?: string | null;
  googleDriveFolderUrl?: string | null;
  attachments?: BidAttachmentItem[];
  showAttachmentsList?: boolean;
  onDocumentAdded?: () => void;
  onDriveUrlUpdated?: (newUrl: string | null) => void;
  className?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(filename: string, category?: string) {
  const lower = filename.toLowerCase();
  if (category === 'contracts' || lower.includes('contract') || lower.includes('agreement')) {
    return <FileText className="w-4 h-4 text-emerald-600" />;
  }
  if (['xlsx', 'xls', 'csv'].some((ext) => lower.endsWith(ext))) {
    return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'svg'].some((ext) => lower.endsWith(ext))) {
    return <ImageIcon className="w-4 h-4 text-purple-600" />;
  }
  if (['dwg', 'dxf', 'cad'].some((ext) => lower.endsWith(ext))) {
    return <FileCode className="w-4 h-4 text-amber-600" />;
  }
  if (lower.endsWith('.pdf')) {
    return <FileText className="w-4 h-4 text-rose-600" />;
  }
  return <File className="w-4 h-4 text-slate-500" />;
}

export default function BidDocumentManager({
  bidId,
  bidNumber,
  projectName,
  googleDriveFolderUrl,
  attachments = [],
  showAttachmentsList = true,
  onDocumentAdded,
  onDriveUrlUpdated,
  className = '',
}: BidDocumentManagerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('contracts');
  const [driveUrlInput, setDriveUrlInput] = useState<string>(googleDriveFolderUrl || '');
  const [isSavingDriveUrl, setIsSavingDriveUrl] = useState(false);
  const [driveSaveSuccess, setDriveSaveSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync driveUrlInput if prop changes
  React.useEffect(() => {
    setDriveUrlInput(googleDriveFolderUrl || '');
  }, [googleDriveFolderUrl]);

  // Handle Google Drive Link Save
  const handleSaveDriveUrl = async () => {
    setIsSavingDriveUrl(true);
    setDriveSaveSuccess(false);
    try {
      const res = await fetch(`/api/bid-requests/${bidId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleDriveFolderUrl: driveUrlInput.trim() || null }),
      });

      if (res.ok) {
        setDriveSaveSuccess(true);
        setTimeout(() => setDriveSaveSuccess(false), 2500);
        if (onDriveUrlUpdated) onDriveUrlUpdated(driveUrlInput.trim() || null);
      } else {
        const err = await res.json();
        alert(`Failed to save Drive URL: ${err.error || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Error saving Drive URL: ${e.message}`);
    } finally {
      setIsSavingDriveUrl(false);
    }
  };

  // Handle File Upload
  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      await uploadBidDocument(bidId, file, selectedCategory);
      if (onDocumentAdded) onDocumentAdded();
    } catch (e: any) {
      setUploadError(e.message || 'Network error during upload');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        await handleUploadFile(e.dataTransfer.files[i]);
      }
    }
  };

  // Handle Delete Attachment
  const handleDeleteAttachment = async (filename: string) => {
    if (!confirm(`Remove "${filename}" from this bid?`)) return;
    setDeletingFilename(filename);
    try {
      const res = await fetch(`/api/bid-requests/${bidId}/documents`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        if (onDocumentAdded) onDocumentAdded();
      } else {
        alert('Failed to remove attachment');
      }
    } catch (e: any) {
      alert(`Error removing attachment: ${e.message}`);
    } finally {
      setDeletingFilename(null);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Google Drive Folder Link Bar */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FolderArchive className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span>Google Drive Project Folder</span>
                {googleDriveFolderUrl && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Linked
                  </span>
                )}
              </h5>
              <p className="text-[11px] text-slate-500">
                Central storage folder for contracts, specs, drawings & estimator takeoffs.
              </p>
            </div>
          </div>

          {googleDriveFolderUrl && (
            <a
              href={googleDriveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>Open Google Drive</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Input to Set/Update Google Drive URL */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="url"
            value={driveUrlInput}
            onChange={(e) => setDriveUrlInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSaveDriveUrl}
            disabled={isSavingDriveUrl || driveUrlInput === (googleDriveFolderUrl || '')}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold transition-colors flex items-center gap-1"
          >
            {isSavingDriveUrl ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : driveSaveSuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : null}
            <span>{driveSaveSuccess ? 'Saved!' : 'Save Drive Link'}</span>
          </button>
        </div>
      </div>

      {/* 2. Direct File Upload Dropzone */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-slate-700" />
            <h5 className="font-bold text-slate-900 text-xs">Attach Documents Directly to Bid</h5>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold text-[11px]">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-bold border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800"
            >
              <option value="contracts">📋 Subcontract / Contract</option>
              <option value="plans_drawings">📐 Plans & Drawings</option>
              <option value="addenda_specs">📋 Addenda & Specs</option>
              <option value="spreadsheets">📊 Spreadsheets / Takeoff</option>
              <option value="photos_images">🖼️ Photos</option>
              <option value="other">📁 Other</option>
            </select>
          </div>
        </div>

        {/* Drag & Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
              : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                for (let i = 0; i < e.target.files.length; i++) {
                  handleUploadFile(e.target.files[i]);
                }
              }
            }}
          />

          <div className="flex flex-col items-center justify-center gap-1 text-slate-500">
            {isUploading ? (
              <div className="flex items-center gap-2 text-blue-600 font-bold text-xs py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Uploading document to secure CRM storage...</span>
              </div>
            ) : (
              <>
                <FolderPlus className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs font-bold text-slate-700">
                  Click to browse files or drag and drop contracts & drawings here
                </span>
                <span className="text-[10px] text-slate-400">
                  Supports PDF, DWG, DXF, XLSX, DOCX, ZIP, PNG, JPG (Saved permanently with this bid)
                </span>
              </>
            )}
          </div>
        </div>

        {uploadError && (
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* 3. Attached Documents List */}
      {showAttachmentsList && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              <span>Bid Documents & Attachments ({attachments.length})</span>
            </span>
          </div>

          {attachments.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              No files attached to this bid yet. Upload contracts, plans, or add Google Drive link above.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attachments.map((att, idx) => {
                const fileUrl =
                  att.storageUrl ||
                  `/api/bid-requests/${bidId}/attachments/${encodeURIComponent(att.filename)}`;
                const downloadUrl =
                  att.storageUrl ||
                  `/api/bid-requests/${bidId}/attachments/${encodeURIComponent(att.filename)}?download=1`;
                const isDeleting = deletingFilename === att.filename;

                return (
                  <div
                    key={`${att.filename}-${idx}`}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70 transition-all flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getFileIcon(att.filename, att.category)}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate" title={att.filename}>
                          {att.filename}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          {att.size ? <span>{formatBytes(att.size)}</span> : null}
                          {att.category && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 uppercase tracking-wider text-[9px] font-bold">
                              {att.category.replace('_', ' ')}
                            </span>
                          )}
                          {att.isManualUpload && (
                            <span className="px-1 py-0.2 rounded bg-blue-100 text-blue-800 font-bold text-[9px]">
                              Manager Upload
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Preview file"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      <a
                        href={downloadUrl}
                        download={att.filename}
                        className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Download file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>

                      {att.isManualUpload && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.filename)}
                          disabled={isDeleting}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete document"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
