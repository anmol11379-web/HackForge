import { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  ArrowRight,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { uploadCsvData, validateCsvData } from '../services/api';
import type { DataStats } from '../types';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (stats: DataStats) => void;
}

type SystemType = 'gateway' | 'bank' | 'ledger';

const SYSTEM_CONFIG: Record<
  SystemType,
  { label: string; file: string; required: string[]; example: string }
> = {
  gateway: {
    label: 'Payment Gateway',
    file: 'gateway_records.csv',
    required: ['transaction_id', 'amount', 'currency', 'gateway_status'],
    example:
      'transaction_id,gateway_payment_id,merchant_id,amount,currency,created_at,authorized_at,captured_at,gateway_status,payment_method,failure_code,failure_message\nTXN3001,GP-3001,MERCH-501,450.00,USD,2026-08-29T10:00:00Z,2026-08-29T10:00:15Z,2026-08-29T10:00:45Z,CAPTURED,credit_card,,',
  },
  bank: {
    label: 'Bank Settlement',
    file: 'bank_settlement_records.csv',
    required: ['transaction_id', 'amount', 'currency', 'bank_status'],
    example:
      'transaction_id,bank_reference_id,settlement_batch_id,amount,currency,received_at,processed_at,bank_status,bank_response_code,bank_response_message,settlement_date\nTXN3001,BNK-3001,BATCH-401,450.00,USD,2026-08-29T10:05:00Z,2026-08-29T10:30:00Z,SETTLED,00,Approved,2026-08-29',
  },
  ledger: {
    label: 'Internal Ledger',
    file: 'ledger_records.csv',
    required: ['transaction_id', 'currency', 'ledger_status'],
    example:
      'transaction_id,ledger_entry_id,account_id,debit_amount,credit_amount,currency,ledger_created_at,ledger_status,reconciliation_status,ledger_description\nTXN3001,LED-3001,ACC-601,450.00,0.00,USD,2026-08-29T10:35:00Z,POSTED,RECONCILED,Settlement payout',
  },
};

export default function CsvUploadModal({
  isOpen,
  onClose,
  onUploadSuccess,
}: CsvUploadModalProps) {
  const [system, setSystem] = useState<SystemType>('gateway');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFileName(null);
    setCsvContent('');
    setPreviewRows([]);
    setDetectedHeaders([]);
    setRowCount(0);
    setValidationError(null);
    setSuccessMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSystemChange = (sys: SystemType) => {
    setSystem(sys);
    if (csvContent) {
      validateContent(sys, csvContent);
    }
  };

  const parseAndPreview = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) {
      setValidationError('File is empty.');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    setDetectedHeaders(headers);

    const dataRows = lines.slice(1).filter((l) => l.trim().length > 0);
    setRowCount(dataRows.length);

    const preview = dataRows.slice(0, 3).map((r) =>
      r.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    );
    setPreviewRows(preview);
  };

  const validateContent = async (sys: SystemType, content: string) => {
    setValidationError(null);
    try {
      const res = await validateCsvData({ system: sys, csvContent: content });
      if (!res.valid) {
        setValidationError(res.error || 'Invalid CSV format.');
      } else {
        setValidationError(null);
      }
    } catch (err: any) {
      setValidationError(err?.response?.data?.error || 'Validation failed.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSuccessMessage(null);

    try {
      const text = await file.text();
      setCsvContent(text);
      parseAndPreview(text);
      await validateContent(system, text);
    } catch {
      setValidationError('Failed to read file contents.');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setValidationError('Please drop a valid .csv file.');
      return;
    }

    setFileName(file.name);
    setSuccessMessage(null);

    try {
      const text = await file.text();
      setCsvContent(text);
      parseAndPreview(text);
      await validateContent(system, text);
    } catch {
      setValidationError('Failed to read file contents.');
    }
  };

  const handleUpload = async () => {
    if (!csvContent || validationError) return;

    setIsUploading(true);
    setSuccessMessage(null);

    try {
      const res = await uploadCsvData({
        system,
        csvContent,
        mode,
      });

      if (res.success) {
        setSuccessMessage(res.message);
        onUploadSuccess(res.stats);
        setTimeout(() => {
          resetForm();
          onClose();
        }, 1800);
      } else {
        setValidationError(res.message || 'Upload failed.');
      }
    } catch (err: any) {
      setValidationError(
        err?.response?.data?.error || err?.message || 'Failed to upload CSV file.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const loadSampleTemplate = () => {
    const example = SYSTEM_CONFIG[system].example;
    setFileName(`sample_${SYSTEM_CONFIG[system].file}`);
    setCsvContent(example);
    parseAndPreview(example);
    validateContent(system, example);
  };

  if (!isOpen) return null;

  const currentSys = SYSTEM_CONFIG[system];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <UploadCloud className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Upload Your Own Data</h2>
              <p className="text-xs text-slate-400">
                Upload custom gateway, bank settlement, or ledger records into the system
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Step 1: System Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              1. Select Destination System
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(SYSTEM_CONFIG) as SystemType[]).map((key) => {
                const conf = SYSTEM_CONFIG[key];
                const isSelected = system === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSystemChange(key)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-white shadow-sm shadow-emerald-500/10'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">{conf.label}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">{conf.file}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Ingestion Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              2. Ingestion Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('append')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'append'
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-white'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-indigo-300">Append New Records</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Adds rows to current records without deleting existing data
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'replace'
                    ? 'bg-amber-500/10 border-amber-500/40 text-white'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-amber-300">Replace Dataset</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Overwrites {currentSys.file} with the new file
                </div>
              </button>
            </div>
          </div>

          {/* Step 3: File Dropzone */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                3. Choose or Drop CSV File
              </label>
              <button
                type="button"
                onClick={loadSampleTemplate}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline underline-offset-2"
              >
                Load Sample Record
              </button>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                fileName
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                {fileName ? (
                  <FileText className="w-6 h-6 text-emerald-400" />
                ) : (
                  <UploadCloud className="w-6 h-6 text-indigo-400" />
                )}
              </div>

              {fileName ? (
                <div>
                  <div className="text-sm font-semibold text-white">{fileName}</div>
                  <div className="text-xs text-emerald-400 mt-1 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {rowCount} data row(s) detected
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    Click to browse or drag & drop your CSV file here
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Expected columns: {currentSys.required.join(', ')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Validation Feedback */}
          {validationError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block mb-0.5">Schema Validation Error</strong>
                {validationError}
              </div>
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Preview snippet if valid */}
          {previewRows.length > 0 && !validationError && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Data Preview (First {previewRows.length} rows)
              </div>
              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950 p-3 max-h-36">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      {detectedHeaders.slice(0, 6).map((h, i) => (
                        <th key={i} className="pb-1 pr-3 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-300">
                    {previewRows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.slice(0, 6).map((cell, cIdx) => (
                          <td key={cIdx} className="py-1 pr-3 whitespace-nowrap">
                            {cell || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleUpload}
            disabled={!csvContent || !!validationError || isUploading}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                Confirm & Import
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
