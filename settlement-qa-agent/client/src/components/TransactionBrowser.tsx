import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { getTransactionCatalog } from '../services/api';
import type { TransactionCatalogItem, SettlementStatus } from '../types';

interface TransactionBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onInvestigate: (transactionId: string) => void;
}

const STATUS_CONFIG: Record<
  SettlementStatus,
  { label: string; bg: string; text: string; border: string; icon: typeof CheckCircle2 }
> = {
  SETTLED: {
    label: 'Settled',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    icon: CheckCircle2,
  },
  PENDING: {
    label: 'Pending',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    icon: Clock,
  },
  DELAYED: {
    label: 'Delayed',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
    icon: Clock,
  },
  FAILED: {
    label: 'Failed',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
    icon: XCircle,
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
    icon: XCircle,
  },
  PARTIALLY_RECORDED: {
    label: 'Partially Recorded',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/20',
    icon: AlertTriangle,
  },
  UNKNOWN: {
    label: 'Unknown',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/20',
    icon: HelpCircle,
  },
};

export default function TransactionBrowser({
  isOpen,
  onClose,
  onInvestigate,
}: TransactionBrowserProps) {
  const [transactions, setTransactions] = useState<TransactionCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'id' | 'amount' | 'date'>('id');
  const [sortAsc, setSortAsc] = useState(true);

  const fetchCatalog = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getTransactionCatalog();
      if (res.success && Array.isArray(res.data)) {
        setTransactions(res.data);
      } else {
        setError('Could not retrieve transaction catalog.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load catalog');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCatalog();
    }
  }, [isOpen]);

  // Status counts for tabs
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: transactions.length };
    transactions.forEach((t) => {
      map[t.overall_status] = (map[t.overall_status] || 0) + 1;
    });
    return map;
  }, [transactions]);

  // Filtered & sorted transactions
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    if (selectedFilter !== 'ALL') {
      list = list.filter((t) => t.overall_status === selectedFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.transaction_id.toLowerCase().includes(q) ||
          (t.merchant_id && t.merchant_id.toLowerCase().includes(q)) ||
          (t.currency && t.currency.toLowerCase().includes(q)) ||
          (t.date && t.date.includes(q)) ||
          t.overall_status.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'id') {
        comparison = a.transaction_id.localeCompare(b.transaction_id, undefined, { numeric: true });
      } else if (sortField === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      } else if (sortField === 'date') {
        comparison = (a.date || '').localeCompare(b.date || '');
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [transactions, selectedFilter, searchTerm, sortField, sortAsc]);

  const handleSort = (field: 'id' | 'amount' | 'date') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <Layers className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Transaction List
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {transactions.length} Loaded
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Browse and investigate all transactions loaded across Gateway, Bank, and Ledger
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCatalog}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/40 transition-colors disabled:opacity-50"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/40 transition-colors"
              title="Close list"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Controls: Search & Filter Pills */}
        <div className="p-6 border-b border-slate-800/60 space-y-4 bg-slate-900/40">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by TXN ID, merchant (e.g. MERCH-501), or date..."
                className="w-full bg-slate-950 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {['ALL', 'SETTLED', 'DELAYED', 'FAILED', 'REJECTED', 'PARTIALLY_RECORDED'].map((key) => {
              const count = counts[key] || 0;
              const isSelected = selectedFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedFilter(key)}
                  className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-all flex items-center gap-1.5 font-medium ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-500/20'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700/40 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span>{key === 'ALL' ? 'All Transactions' : key.replace('_', ' ')}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-700/60 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading && transactions.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 mx-auto border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Loading transaction catalog...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm text-center">
              {error}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              No transactions match your search filter "{searchTerm}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th
                      onClick={() => handleSort('id')}
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Transaction ID <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('date')}
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Date <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('amount')}
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Amount <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-3">Gateway</th>
                    <th className="py-3 px-3">Bank Settlement</th>
                    <th className="py-3 px-3">Ledger</th>
                    <th className="py-3 px-3">Overall Outcome</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTransactions.map((tx) => {
                    const statusConf = STATUS_CONFIG[tx.overall_status] || STATUS_CONFIG.UNKNOWN;
                    const StatusIcon = statusConf.icon;

                    return (
                      <tr
                        key={tx.transaction_id}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        <td className="py-3 px-3 font-mono font-semibold text-white">
                          <span className="bg-slate-800 px-2 py-1 rounded text-indigo-300 border border-slate-700/60">
                            {tx.transaction_id}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">{tx.date || '—'}</td>
                        <td className="py-3 px-3 text-slate-200 font-medium">
                          {tx.amount !== null
                            ? `${tx.currency || 'USD'} ${tx.amount.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              tx.gateway_status === 'CAPTURED'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : tx.gateway_status === 'MISSING'
                                ? 'bg-slate-800 text-slate-500'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {tx.gateway_status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              tx.bank_status === 'SETTLED'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : tx.bank_status === 'MISSING'
                                ? 'bg-slate-800 text-slate-500'
                                : tx.bank_status === 'PENDING'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {tx.bank_status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              tx.ledger_status.includes('POSTED')
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : tx.ledger_status === 'MISSING'
                                ? 'bg-slate-800 text-slate-500'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {tx.ledger_status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {statusConf.label}
                            </span>
                            {tx.exception_count > 0 && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono"
                                title={`${tx.exception_count} reconciliation exception(s)`}
                              >
                                !{tx.exception_count}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              onInvestigate(tx.transaction_id);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-all shadow-sm group-hover:scale-105"
                          >
                            Investigate
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{filteredTransactions.length}</strong> of{' '}
            <strong className="text-white">{transactions.length}</strong> transactions
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
