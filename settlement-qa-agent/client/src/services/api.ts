import axios from 'axios';
import type { ApiResponse, HealthResponse, InvestigationResult } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export async function askQuestion(
  question: string,
): Promise<ApiResponse<InvestigationResult | InvestigationResult[]>> {
  const { data } = await api.post<ApiResponse<InvestigationResult | InvestigationResult[]>>('/ask', { question });
  return data;
}

export async function investigateTransaction(
  transactionId: string,
): Promise<ApiResponse<InvestigationResult>> {
  const { data } = await api.get<ApiResponse<InvestigationResult>>(`/investigate/${transactionId}`);
  return data;
}

export async function getTransactionsByDate(date: string): Promise<ApiResponse<string[]>> {
  const { data } = await api.get<ApiResponse<string[]>>(`/transactions`, { params: { date } });
  return data;
}

export async function getTransactionCatalog(): Promise<{
  success: boolean;
  data: import('../types').TransactionCatalogItem[];
  total: number;
}> {
  const { data } = await api.get('/transactions/catalog');
  return data;
}

export async function uploadCsvData(payload: import('../types').UploadCsvPayload): Promise<import('../types').UploadResponse> {
  const { data } = await api.post('/data/upload', payload);
  return data;
}

export async function validateCsvData(payload: {
  system: 'gateway' | 'bank' | 'ledger';
  csvContent: string;
}): Promise<{ valid: boolean; error?: string; rowCount: number; headers: string[] }> {
  const { data } = await api.post('/data/validate', payload);
  return data;
}

export async function reloadData(): Promise<{ success: boolean; message: string; stats: import('../types').DataStats }> {
  const { data } = await api.post('/data/reload');
  return data;
}

export async function getDataStats(): Promise<{ success: boolean; stats: import('../types').DataStats }> {
  const { data } = await api.get('/data/stats');
  return data;
}

export async function getRawRecords(): Promise<{
  success: boolean;
  data: {
    gateway: Record<string, any>[];
    bank: Record<string, any>[];
    ledger: Record<string, any>[];
  };
}> {
  const { data } = await api.get('/data/records');
  return data;
}
