import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Sparkles,
  Database,
  Send,
  RefreshCw,
  Search,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  askQuestion,
  checkHealth,
  getRawRecords,
} from '../services/api';
import type {
  InvestigationResult,
  HealthResponse,
  GatewayRecord,
  BankRecord,
  LedgerRecord,
} from '../types';
import TransactionBrowser from '../components/TransactionBrowser';
import CsvUploadModal from '../components/CsvUploadModal';
import AnimatedFooterLogo from '../components/AnimatedFooterLogo';
import HackForgeMonogramLogo from '../components/HackForgeMonogramLogo';
import RawEvidenceInspector from '../components/RawEvidenceInspector';
import MarkdownMessage from '../components/MarkdownMessage';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  result?: InvestigationResult;
  timestamp: string;
}


export default function Dashboard() {
  // Chat & Investigation state
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: "Hello! I am Fintech AI. Enter any Transaction ID (like TXN1001) or ask what happened to a payment, and I will trace it across all systems for you.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTxnId, setActiveTxnId] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<InvestigationResult | null>(null);

  // Database viewer state
  const [activeTab, setActiveTab] = useState<'gateway' | 'bank' | 'ledger' | 'evidence'>('gateway');
  const [tableFilter, setTableFilter] = useState('');
  const [records, setRecords] = useState<{
    gateway: GatewayRecord[];
    bank: BankRecord[];
    ledger: LedgerRecord[];
  }>({
    gateway: [],
    bank: [],
    ledger: [],
  });
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Header & Modals
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load initial records & health
  const fetchRecords = async () => {
    setIsDataLoading(true);
    try {
      const [recData, healthData] = await Promise.all([
        getRawRecords(),
        checkHealth().catch(() => null),
      ]);
      if (recData.success && recData.data) {
        setRecords(recData.data as any);
      }
      if (healthData) {
        setHealth(healthData);
      }
    } catch (err) {
      console.error('Failed to load records:', err);
    } finally {
      setIsDataLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Handle Search / Query submit
  const handleRunQuery = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setQuery('');
    setIsLoading(true);

    // Try to detect txn ID for table highlight
    const match = trimmed.match(/TXN\d+/i);
    const targetTxn = match ? match[0].toUpperCase() : null;
    if (targetTxn) {
      setActiveTxnId(targetTxn);
    }

    try {
      const response = await askQuestion(trimmed);

      if (!response.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            text: response.error || 'An error occurred while investigating.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        return;
      }

      // Handle results
      if (response.data) {
        if (Array.isArray(response.data)) {
          // Multiple results
          const first = response.data[0];
          if (first) {
            setActiveTxnId(first.transaction_id);
            setActiveResult(first);
          }
          response.data.forEach((item, index) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent-${Date.now()}-${index}`,
                role: 'agent',
                result: item,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          });
        } else {
          const single = response.data as InvestigationResult;
          setActiveTxnId(single.transaction_id);
          setActiveResult(single);
          setMessages((prev) => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              role: 'agent',
              result: single,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      } else if (response.answer) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            text: response.answer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.answer || err?.response?.data?.error || err?.message || 'Failed to connect to analysis engine.';
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-${Date.now()}`,
          role: 'agent',
          text: msg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Click on a table row to quickly investigate
  const handleRowClick = (txnId: string) => {
    setActiveTxnId(txnId);
    handleRunQuery(`Investigate ${txnId}`);
  };

  // Render status badge for tables & results
  const renderStatusBadge = (statusStr: string | null | undefined) => {
    if (!statusStr) return <span className="text-slate-500">—</span>;
    const lower = statusStr.toLowerCase();
    const formattedStr = statusStr.replace(/_/g, ' ');

    if (
      lower.includes('settled') ||
      lower.includes('authorized') ||
      lower.includes('captured') ||
      lower.includes('posted') ||
      lower.includes('reconciled') ||
      lower === 'none'
    ) {
      return (
        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-xs font-medium">
          {formattedStr}
        </span>
      );
    }

    if (
      lower.includes('fail') ||
      lower.includes('reject') ||
      lower.includes('revers') ||
      lower.includes('mismatch') ||
      lower.includes('decline') ||
      lower.includes('unreconciled')
    ) {
      return (
        <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded text-xs font-medium">
          {formattedStr}
        </span>
      );
    }

    if (lower.includes('pending') || lower.includes('delay') || lower.includes('partial')) {
      return (
        <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded text-xs font-medium">
          {formattedStr}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs font-medium">
        {formattedStr}
      </span>
    );
  };

  // Get filtered table data
  const currentTableData = () => {
    const list = records[activeTab === 'evidence' ? 'gateway' : activeTab] || [];
    if (!tableFilter) return list;
    const f = tableFilter.toLowerCase();
    return list.filter((row) =>
      Object.values(row).some((val) => String(val || '').toLowerCase().includes(f)),
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-slate-200 select-none relative">
      {/* Animated Color-Fading Grid Background (Light Blue -> Black -> Dark Green) */}
      <div className="animated-grid-wrapper">
        <div className="grid-base" />
        <div className="glow-layer-blue" />
        <div className="grid-layer-blue" />
        <div className="glow-layer-green" />
        <div className="grid-layer-green" />
        <div className="grid-vignette" />
      </div>

      {/* Header */}
      <header className="bg-black/40 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between z-20 shadow-lg shrink-0">
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center">
            <HackForgeMonogramLogo className="w-10 h-10 drop-shadow-[0_0_14px_rgba(56,189,248,0.5)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
              Fintech{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400 font-extrabold">
                Solution
              </span>
            </h1>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsBrowserOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-white/10 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
            <span>Transaction List</span>
          </button>

          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-white/10 transition-colors shadow-sm"
          >
            <UploadCloud className="w-3.5 h-3.5 text-purple-400" />
            <span>Upload Your Own Data</span>
          </button>

          <button
            onClick={fetchRecords}
            title="Reload CSV files from disk"
            className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDataLoading ? 'animate-spin' : ''}`} />
          </button>

          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-white/10 text-xs font-medium text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Powered by Groq</span>
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative z-10">
        {/* ============================================================ */}
        {/* Left Panel: AI Agent Interface */}
        {/* ============================================================ */}
        <section className="w-full md:w-5/12 lg:w-4/12 flex flex-col border-r border-white/10 bg-black/25 backdrop-blur-md z-10 relative shadow-2xl h-full">
          {/* Top Panel Intro */}
          <div className="p-4 md:p-5 border-b border-white/10 shrink-0">
            <h2 className="text-base font-semibold mb-1 flex items-center text-white">
              <Sparkles className="w-4 h-4 mr-2 text-blue-400" />
              Investigate Transaction
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your intelligent assistant for payment tracking. Ask Fintech AI about any transaction ID, delay, or status check to get clear, straightforward answers instantly.
            </p>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col space-y-1.5 ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {/* Header with Avatar & Name */}
                <div
                  className={`flex items-center space-x-2 ${
                    msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center font-bold text-xs shadow-md text-slate-200">
                      You
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-xs shadow-[0_0_10px_rgba(139,92,246,0.5)] text-white">
                      AI
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-400">
                    {msg.role === 'user' ? 'You' : 'Fintech AI'}
                  </span>
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                </div>

                {/* Message Body */}
                {msg.role === 'user' ? (
                  <div className="bg-slate-800/90 border border-white/10 backdrop-blur-md px-4 py-3 rounded-2xl rounded-tr-none text-sm text-slate-100 shadow-md max-w-[90%]">
                    {msg.text}
                  </div>
                ) : msg.result ? (
                  /* Rich Structured Investigation Card */
                  <div className="glass-panel p-4 md:p-5 rounded-2xl rounded-tl-none text-sm text-slate-300 shadow-xl max-w-[98%] w-full space-y-4">
                    {/* Header: TXN ID + Status */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-blue-400">
                          {msg.result.transaction_id}
                        </span>
                        {renderStatusBadge(msg.result.status)}
                      </div>
                      <div className="text-xs text-slate-400">
                        Confidence:{' '}
                        <span
                          className={`font-semibold capitalize ${
                            msg.result.confidence === 'high'
                              ? 'text-emerald-400'
                              : msg.result.confidence === 'medium'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {msg.result.confidence}
                        </span>
                      </div>
                    </div>

                    {/* Settlement Status Section */}
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5">
                        Settlement Status
                      </h3>
                      <div className="text-slate-100 text-sm leading-relaxed">
                        <MarkdownMessage content={msg.result.explanation?.reason || msg.result.summary || ''} />
                      </div>
                    </div>

                    {/* Explanation */}
                    {msg.result.explanation?.summary && (
                      <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5">
                          Explanation
                        </h3>
                        <div className="text-slate-300 text-sm leading-relaxed">
                          <MarkdownMessage content={msg.result.explanation.summary} />
                        </div>
                      </div>
                    )}

                    {/* Timeline Breakdown */}
                    {msg.result.explanation?.timeline_explanation &&
                      msg.result.explanation.timeline_explanation.length > 0 && (
                        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-300 mb-2">
                            Timeline Events
                          </h3>
                          <ol className="space-y-2 text-xs text-slate-300">
                            {msg.result.explanation.timeline_explanation.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-300 ring-1 ring-blue-400/20">
                                  {idx + 1}
                                </span>
                                <span className="pt-0.5 leading-relaxed">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                    {/* Detected Problems Box */}
                    {msg.result.exceptions && msg.result.exceptions.length > 0 ? (
                      <div className="exception-box p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-300 mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          Detected Problem{msg.result.exceptions.length !== 1 ? 's' : ''} ({msg.result.exceptions.length})
                        </h3>
                        <ul className="space-y-2 text-xs text-slate-300 mt-1.5">
                          {msg.result.exceptions.map((ex, idx) => (
                            <li key={idx} className="flex items-start gap-2 leading-relaxed">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                              <span><strong className="font-semibold text-rose-200">{ex.type.replace(/_/g, ' ')}:</strong>{' '}{ex.message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-xs text-emerald-300">
                        <span className="font-semibold">Consistency Check:</span> Data is verified across all systems. No exceptions detected.
                      </div>
                    )}

                    {/* Recommended Action */}
                    {msg.result.explanation?.recommended_action && (
                      <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl text-xs text-blue-200">
                        <div className="font-semibold uppercase tracking-wide text-blue-300 mb-1.5">Recommended Action</div>
                        <div className="text-xs text-slate-200 leading-relaxed">
                          <MarkdownMessage content={msg.result.explanation.recommended_action} />
                        </div>
                      </div>
                    )}

                    {/* Inspect Button */}
                    <div className="pt-2 flex justify-between items-center text-xs">
                      <button
                        onClick={() => {
                          setActiveTab('evidence');
                          setActiveResult(msg.result!);
                        }}
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                      >
                        <span>Inspect Raw Evidence</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      {msg.result.amount !== null && (
                        <span className="font-mono text-slate-400 text-xs">
                          {msg.result.currency} {msg.result.amount.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="glass-panel p-4 md:p-5 rounded-2xl rounded-tl-none text-sm text-slate-300 shadow-md max-w-[95%]">
                    <MarkdownMessage content={msg.text || ''} />
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex flex-col space-y-1.5 items-start">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-xs shadow-[0_0_10px_rgba(139,92,246,0.5)] text-white">
                    AI
                  </div>
                  <span className="text-xs font-medium text-slate-400">Fintech AI</span>
                </div>
                <div className="glass-panel p-4 rounded-2xl rounded-tl-none self-start flex items-center space-x-3 text-slate-400 text-xs">
                  <div className="loader" />
                  <span>Tracing transaction across systems...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 md:p-4 border-t border-white/10 bg-black/40 backdrop-blur-md shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunQuery(query);
              }}
              className="relative flex items-center rgb-glow rounded-xl transition-all duration-300"
            >
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="E.g., What happened to TXN1003?"
                className="w-full bg-black/50 border border-white/10 rounded-xl py-2.5 pl-4 pr-12 text-sm text-white placeholder-slate-500 focus:outline-none transition-all"
              />
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="absolute right-1.5 p-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(59,130,246,0.3)]"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Right Panel: Mock Databases (Internal Logs) */}
        {/* ============================================================ */}
        <section className="w-full md:w-7/12 lg:w-8/12 flex flex-col bg-transparent relative h-full">
          {/* Subheader with Tabs and Filter */}
          <div className="p-3 md:p-4 border-b border-white/10 flex flex-wrap gap-3 justify-between items-center bg-black/40 backdrop-blur-md shrink-0">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Database
              </h2>
              {activeTxnId && (
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Inspecting: {activeTxnId}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* Search within table */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder="Filter records..."
                  className="bg-black/50 border border-white/10 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none w-36 sm:w-44 transition-all"
                />
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 bg-black/50 p-1 rounded-lg border border-white/10">
                <button
                  onClick={() => setActiveTab('gateway')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activeTab === 'gateway'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Gateway API ({records.gateway.length})
                </button>
                <button
                  onClick={() => setActiveTab('bank')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activeTab === 'bank'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bank Recon ({records.bank.length})
                </button>
                <button
                  onClick={() => setActiveTab('ledger')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activeTab === 'ledger'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Internal Ledger ({records.ledger.length})
                </button>
                {activeResult && (
                  <button
                    onClick={() => setActiveTab('evidence')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      activeTab === 'evidence'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-purple-400 hover:text-purple-200'
                    }`}
                  >
                    Raw Evidence
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table / Evidence Content */}
          <div className="flex-1 overflow-auto p-3 md:p-4">
            <div className="glass-panel rounded-xl overflow-hidden h-full flex flex-col">
              {activeTab === 'evidence' && activeResult ? (
                <RawEvidenceInspector
                  result={activeResult}
                  onBack={() => setActiveTab('gateway')}
                />
              ) : (
                /* Interactive Table View */
                <div className="flex-1 overflow-auto">
                  {currentTableData().length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      No records found matching filter.
                    </div>
                  ) : (
                    <>
                      <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-black/60 border-b border-white/10 backdrop-blur-sm sticky top-0 z-10">
                          {activeTab === 'gateway' && (
                            <>
                              <th className="p-3 font-semibold text-slate-300">Txn ID</th>
                              <th className="p-3 font-semibold text-slate-300">Payment ID</th>
                              <th className="p-3 font-semibold text-slate-300">Amount</th>
                              <th className="p-3 font-semibold text-slate-300">Status</th>
                              <th className="p-3 font-semibold text-slate-300">Method</th>
                              <th className="p-3 font-semibold text-slate-300">Created At</th>
                              <th className="p-3 font-semibold text-slate-300">Failure Code</th>
                            </>
                          )}
                          {activeTab === 'bank' && (
                            <>
                              <th className="p-3 font-semibold text-slate-300">Txn ID</th>
                              <th className="p-3 font-semibold text-slate-300">Bank Ref</th>
                              <th className="p-3 font-semibold text-slate-300">Batch ID</th>
                              <th className="p-3 font-semibold text-slate-300">Amount</th>
                              <th className="p-3 font-semibold text-slate-300">Status</th>
                              <th className="p-3 font-semibold text-slate-300">Settlement Date</th>
                              <th className="p-3 font-semibold text-slate-300">Response</th>
                            </>
                          )}
                          {activeTab === 'ledger' && (
                            <>
                              <th className="p-3 font-semibold text-slate-300">Txn ID</th>
                              <th className="p-3 font-semibold text-slate-300">Ledger Entry</th>
                              <th className="p-3 font-semibold text-slate-300">Account</th>
                              <th className="p-3 font-semibold text-slate-300">Debit / Credit</th>
                              <th className="p-3 font-semibold text-slate-300">Status</th>
                              <th className="p-3 font-semibold text-slate-300">Reconciliation</th>
                              <th className="p-3 font-semibold text-slate-300">Description</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {currentTableData().map((row: any, i: number) => {
                          const isHighlighted = activeTxnId && row.transaction_id === activeTxnId;
                          return (
                            <tr
                              key={i}
                              onClick={() => handleRowClick(row.transaction_id)}
                              title="Click to investigate this transaction"
                              className={`border-b border-white/5 transition-all cursor-pointer ${
                                isHighlighted
                                  ? 'bg-blue-900/40 shadow-[inset_0_0_15px_rgba(59,130,246,0.3)] border-blue-500/40'
                                  : i % 2 === 0
                                  ? 'bg-black/20 hover:bg-white/5'
                                  : 'bg-transparent hover:bg-white/5'
                              }`}
                            >
                              {activeTab === 'gateway' && (
                                <>
                                  <td className="p-3 font-mono font-semibold text-blue-400">
                                    {row.transaction_id}
                                  </td>
                                  <td className="p-3 text-slate-400 font-mono">{row.gateway_payment_id}</td>
                                  <td className="p-3 font-medium text-slate-200">
                                    {row.currency} {Number(row.amount).toFixed(2)}
                                  </td>
                                  <td className="p-3">{renderStatusBadge(row.gateway_status)}</td>
                                  <td className="p-3 text-slate-400 capitalize">{row.payment_method?.replace(/_/g, ' ')}</td>
                                  <td className="p-3 text-slate-400">{row.created_at?.slice(0, 19).replace('T', ' ')}</td>
                                  <td className="p-3">{renderStatusBadge(row.failure_code)}</td>
                                </>
                              )}
                              {activeTab === 'bank' && (
                                <>
                                  <td className="p-3 font-mono font-semibold text-blue-400">
                                    {row.transaction_id}
                                  </td>
                                  <td className="p-3 text-slate-400 font-mono">{row.bank_reference_id}</td>
                                  <td className="p-3 text-slate-400 font-mono">{row.settlement_batch_id}</td>
                                  <td className="p-3 font-medium text-slate-200">
                                    {row.currency} {Number(row.amount).toFixed(2)}
                                  </td>
                                  <td className="p-3">{renderStatusBadge(row.bank_status)}</td>
                                  <td className="p-3 text-slate-400">{row.settlement_date || 'Pending'}</td>
                                  <td className="p-3 text-slate-400">{row.bank_response_message?.replace(/_/g, ' ')}</td>
                                </>
                              )}
                              {activeTab === 'ledger' && (
                                <>
                                  <td className="p-3 font-mono font-semibold text-blue-400">
                                    {row.transaction_id}
                                  </td>
                                  <td className="p-3 text-slate-400 font-mono">{row.ledger_entry_id}</td>
                                  <td className="p-3 text-slate-400 font-mono">{row.account_id}</td>
                                  <td className="p-3 font-medium text-slate-200">
                                    {row.currency} {Number(row.debit_amount || row.credit_amount).toFixed(2)}
                                  </td>
                                  <td className="p-3">{renderStatusBadge(row.ledger_status)}</td>
                                  <td className="p-3">{renderStatusBadge(row.reconciliation_status)}</td>
                                  <td className="p-3 text-slate-400 truncate max-w-xs">{row.ledger_description?.replace(/_/g, ' ')}</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="h-4" />
                  </>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Slim Compact Footer Box below Mock Database */}
          <div className="py-1 px-3 border-t border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-center shrink-0">
            <div className="flex items-center gap-2.5 select-none opacity-85 hover:opacity-100 transition-opacity duration-300 cursor-default">
              <span className="text-xs font-medium tracking-wide text-slate-400">
                Powered by
              </span>
              <AnimatedFooterLogo />
            </div>
          </div>
        </section>
      </main>

      {/* Modals */}
      {isBrowserOpen && (
        <TransactionBrowser
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          onInvestigate={(txnId) => {
            setIsBrowserOpen(false);
            handleRowClick(txnId);
          }}
        />
      )}

      {isUploadOpen && (
        <CsvUploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() => {
            fetchRecords();
            setIsUploadOpen(false);
          }}
        />
      )}
    </div>
  );
}
