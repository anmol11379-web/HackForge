import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Building2,
  Landmark,
  Receipt,
  ArrowLeft,
  Calendar,
  DollarSign,
  Layers,
} from 'lucide-react';
import type { InvestigationResult } from '../types';

interface RawEvidenceInspectorProps {
  result: InvestigationResult;
  onBack: () => void;
}

export default function RawEvidenceInspector({
  result,
  onBack,
}: RawEvidenceInspectorProps) {
  const { raw_evidence, transaction_id, status, confidence, exceptions } = result;
  const { gateway, bank, ledger } = raw_evidence;

  const formatTimestamp = (ts: string | null | undefined) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
    } catch {
      return ts;
    }
  };

  const formatAmount = (val: number | undefined | null, curr = 'USD') => {
    if (val === undefined || val === null) return '—';
    return `${curr} ${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (st: string | null | undefined) => {
    if (!st) return null;
    const formatted = st.replace(/_/g, ' ');
    switch (st.toUpperCase()) {
      case 'SETTLED':
      case 'CAPTURED':
      case 'POSTED':
      case 'RECONCILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {formatted}
          </span>
        );
      case 'DELAYED':
      case 'PENDING':
      case 'PARTIALLY_RECORDED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            {formatted}
          </span>
        );
      case 'FAILED':
      case 'REJECTED':
      case 'AUTHORIZATION_FAILED':
      case 'UNRECONCILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            {formatted}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            {formatted}
          </span>
        );
    }
  };

  // Quick discrepancy detection
  const amounts = [
    gateway?.amount,
    bank.length > 0 ? bank[0].amount : undefined,
    ledger.length > 0 ? ledger[0].debit_amount : undefined,
  ].filter((a): a is number => a !== undefined);
  const hasAmountMismatch = amounts.length > 1 && new Set(amounts).size > 1;

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs select-text">
      {/* ============================================================ */}
      {/* Top Header & View Controls */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/10 gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span className="font-mono text-cyan-400">{transaction_id}</span>
              <span className="text-slate-400 font-normal">|</span>
              <span>Evidence Bundle</span>
            </h2>
            {getStatusBadge(status)}
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                confidence === 'high'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : confidence === 'medium'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {confidence} Confidence
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Audit-grade cross-system raw verification records from Payment Gateway, Bank Settlement, and Ledger.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-white/10 transition-colors shadow-sm font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Tables</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Discrepancy / Problem Alerts Banner (if any) */}
      {/* ============================================================ */}
      {exceptions && exceptions.length > 0 && (
        <div className="bg-rose-950/15 border border-rose-500/20 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-rose-300 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{exceptions.length} Detected Problem{exceptions.length !== 1 ? 's' : ''} Verified in Evidence</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {exceptions.map((ex, i) => (
              <div
                key={i}
                className="bg-black/40 border border-rose-500/15 rounded-lg p-2 text-[11px] text-rose-200"
              >
                <div className="font-bold text-rose-300">{ex.type.replace(/_/g, ' ')}</div>
                <div className="text-slate-300 mt-0.5">{ex.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Cross-System Summary Matrix Ribbon */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Gateway Summary Pill */}
        <div className="bg-slate-900/60 border border-blue-500/25 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              <Building2 className="w-4 h-4" />
              <span>Gateway API</span>
            </div>
            {gateway ? (
              getStatusBadge(gateway.gateway_status)
            ) : (
              <span className="text-rose-400 text-[10px] font-bold uppercase bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            <div className="text-slate-400 flex justify-between">
              <span>Amount:</span>
              <span className="text-white font-bold">
                {gateway ? formatAmount(gateway.amount, gateway.currency) : '—'}
              </span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Payment ID:</span>
              <span className="text-cyan-300">{gateway?.gateway_payment_id || '—'}</span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Timestamp:</span>
              <span className="text-slate-300 text-[10px]">
                {gateway?.created_at ? new Date(gateway.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Bank Recon Summary Pill */}
        <div className="bg-slate-900/60 border border-emerald-500/25 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Landmark className="w-4 h-4" />
              <span>Bank Recon ({bank.length})</span>
            </div>
            {bank.length > 0 ? (
              getStatusBadge(bank[0].bank_status)
            ) : (
              <span className="text-rose-400 text-[10px] font-bold uppercase bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            <div className="text-slate-400 flex justify-between">
              <span>Settled:</span>
              <span
                className={`font-bold ${
                  hasAmountMismatch ? 'text-amber-400 font-extrabold' : 'text-white'
                }`}
              >
                {bank.length > 0 ? formatAmount(bank[0].amount, bank[0].currency) : '—'}
              </span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Bank Ref:</span>
              <span className="text-emerald-300">{bank[0]?.bank_reference_id || '—'}</span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Batch ID:</span>
              <span className="text-slate-300">{bank[0]?.settlement_batch_id || '—'}</span>
            </div>
          </div>
        </div>

        {/* Ledger Summary Pill */}
        <div className="bg-slate-900/60 border border-purple-500/25 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold">
              <Receipt className="w-4 h-4" />
              <span>General Ledger ({ledger.length})</span>
            </div>
            {ledger.length > 0 ? (
              getStatusBadge(ledger[0].reconciliation_status || ledger[0].ledger_status)
            ) : (
              <span className="text-rose-400 text-[10px] font-bold uppercase bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                Missing
              </span>
            )}
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            <div className="text-slate-400 flex justify-between">
              <span>Posted:</span>
              <span className="text-white font-bold">
                {ledger.length > 0
                  ? formatAmount(ledger[0].debit_amount, ledger[0].currency)
                  : '—'}
              </span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Ledger ID:</span>
              <span className="text-purple-300">{ledger[0]?.ledger_entry_id || '—'}</span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Account:</span>
              <span className="text-slate-300">{ledger[0]?.account_id || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Main Body: Cross-System Structured Verification Cards */}
      {/* ============================================================ */}
      <div className="space-y-4">
        {/* ──────────────────────────────────────────────────────── */}
        {/* 1. Gateway API Record Card */}
        {/* ──────────────────────────────────────────────────────── */}
        <div className="bg-slate-900/70 border border-blue-500/30 rounded-xl overflow-hidden shadow-lg">
          <div className="bg-blue-950/40 px-4 py-2.5 border-b border-blue-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <span>Payment Gateway Record</span>
                <span className="font-mono text-xs text-blue-300 font-normal">
                  Gateway API Logs
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {gateway && getStatusBadge(gateway.gateway_status)}
            </div>
          </div>

            {gateway ? (
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 font-sans">
                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Payment ID</div>
                  <div className="font-mono text-xs text-cyan-300 font-bold mt-0.5 select-all">
                    {gateway.gateway_payment_id}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Authorized Amount</div>
                  <div className="font-mono text-xs text-white font-bold mt-0.5">
                    {formatAmount(gateway.amount, gateway.currency)}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Payment Method</div>
                  <div className="text-xs text-slate-200 capitalize mt-0.5">
                    {gateway.payment_method?.replace(/_/g, ' ') || 'Credit Card'}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Merchant ID</div>
                  <div className="font-mono text-xs text-slate-300 mt-0.5">
                    {gateway.merchant_id}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Created At</div>
                  <div className="font-mono text-[11px] text-slate-300 mt-0.5">
                    {formatTimestamp(gateway.created_at)}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Authorized At</div>
                  <div className="font-mono text-[11px] text-slate-300 mt-0.5">
                    {formatTimestamp(gateway.authorized_at)}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Captured At</div>
                  <div className="font-mono text-[11px] text-slate-300 mt-0.5">
                    {formatTimestamp(gateway.captured_at)}
                  </div>
                </div>

                <div className="bg-black/40 border border-white/5 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Failure Code / Message</div>
                  <div className="text-[11px] mt-0.5">
                    {gateway.failure_code ? (
                      <span className="text-rose-400 font-bold font-mono">
                        {gateway.failure_code.replace(/_/g, ' ')}: {gateway.failure_message || 'Declined'}
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-semibold">None (No Error)</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-rose-300 bg-rose-950/20 flex flex-col items-center gap-1.5">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span className="font-bold">Missing Payment Gateway Record</span>
                <p className="text-slate-400 text-xs max-w-md">
                  No record was found in the gateway logs for {transaction_id}. The payment may have bypassed the gateway or failed prior to authorization.
                </p>
              </div>
            )}
          </div>

          {/* ──────────────────────────────────────────────────────── */}
          {/* 2. Bank Settlement Records Card */}
          {/* ──────────────────────────────────────────────────────── */}
          <div className="bg-slate-900/70 border border-emerald-500/30 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-emerald-950/40 px-4 py-2.5 border-b border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>Bank Settlement Records</span>
                  <span className="font-mono text-xs text-emerald-300 font-normal">
                    ({bank.length} record{bank.length !== 1 ? 's' : ''}) Bank Settlement Logs
                  </span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(
                  bank.length > 0 ? bank[0].bank_status : 'MISSING'
                )}
              </div>
            </div>

            {bank.length > 0 ? (
              <div className="p-4 space-y-3">
                {bank.map((rec, index) => (
                  <div
                    key={index}
                    className="bg-black/40 border border-white/10 rounded-lg p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" />
                        <span>Record #{index + 1} — Bank Reference: {rec.bank_reference_id}</span>
                      </span>
                      {getStatusBadge(rec.bank_status)}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 font-sans">
                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Settlement Amount</div>
                        <div className="font-mono text-xs font-bold text-white mt-0.5">
                          {formatAmount(rec.amount, rec.currency)}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Batch ID</div>
                        <div className="font-mono text-xs text-slate-200 mt-0.5">
                          {rec.settlement_batch_id || '—'}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Settlement Date</div>
                        <div className="font-mono text-xs text-slate-200 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{rec.settlement_date || 'Pending / None'}</span>
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Bank Response</div>
                        <div className="text-xs text-slate-200 mt-0.5">
                          <span className="font-mono font-bold text-cyan-400">{rec.bank_response_code}</span>{' '}
                          {rec.bank_response_message?.replace(/_/g, ' ') || 'Approved'}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Received At</div>
                        <div className="font-mono text-[11px] text-slate-300 mt-0.5">
                          {formatTimestamp(rec.received_at)}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Processed At</div>
                        <div className="font-mono text-[11px] text-slate-300 mt-0.5">
                          {formatTimestamp(rec.processed_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-rose-300 bg-rose-950/20 flex flex-col items-center gap-1.5">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span className="font-bold">Missing Bank Settlement Records</span>
                <p className="text-slate-400 text-xs max-w-md">
                  No bank settlement confirmations were found for {transaction_id}. The transaction may have been dropped before transmission to the acquiring bank, or is pending a future settlement batch.
                </p>
              </div>
            )}
          </div>

          {/* ──────────────────────────────────────────────────────── */}
          {/* 3. Internal Ledger Entries Card */}
          {/* ──────────────────────────────────────────────────────── */}
          <div className="bg-slate-900/70 border border-purple-500/30 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-purple-950/40 px-4 py-2.5 border-b border-purple-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>Internal General Ledger Entries</span>
                  <span className="font-mono text-xs text-purple-300 font-normal">
                    ({ledger.length} entry{ledger.length !== 1 ? 'ies' : ''}) Internal Ledger Logs
                  </span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {ledger.length > 0 &&
                  getStatusBadge(
                    ledger[0].reconciliation_status || ledger[0].ledger_status
                  )}
              </div>
            </div>

            {ledger.length > 0 ? (
              <div className="p-4 space-y-3">
                {ledger.map((entry, index) => (
                  <div
                    key={index}
                    className="bg-black/40 border border-white/10 rounded-lg p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="font-bold text-purple-300 flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Entry #{index + 1} — Ledger ID: {entry.ledger_entry_id}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(entry.ledger_status)}
                        {getStatusBadge(entry.reconciliation_status)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 font-sans">
                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Debit Amount</div>
                        <div className="font-mono text-xs font-bold text-emerald-300 mt-0.5">
                          {formatAmount(entry.debit_amount, entry.currency)}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Credit Amount</div>
                        <div className="font-mono text-xs text-slate-300 mt-0.5">
                          {formatAmount(entry.credit_amount, entry.currency)}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Account ID</div>
                        <div className="font-mono text-xs text-slate-200 mt-0.5">
                          {entry.account_id}
                        </div>
                      </div>

                      <div className="bg-black/30 border border-white/5 p-2 rounded">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Created Timestamp</div>
                        <div className="font-mono text-[11px] text-slate-300 mt-0.5">
                          {formatTimestamp(entry.ledger_created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Entry Description */}
                    <div className="bg-black/30 border border-white/5 p-2 rounded text-[11px] text-slate-300">
                      <span className="text-slate-400 font-semibold">Description: </span>
                      {entry.ledger_description}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-rose-300 bg-rose-950/20 flex flex-col items-center gap-1.5">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span className="font-bold">Missing Internal Ledger Entries</span>
                <p className="text-slate-400 text-xs max-w-md">
                  No posting records were found in the internal general ledger for {transaction_id}. Double-entry posting did not execute or failed to write to disk.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
