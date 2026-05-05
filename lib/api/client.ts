// ============================================================
//  VISION R+ Mobile — Client API
// ============================================================
import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://vision-rplus-backend-production.up.railway.app/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  r => r,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('access_token');
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  login:    (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  me:       () => api.get('/auth/me').then(r => r.data),
};

// ── Companies ─────────────────────────────────────────────────
export const companiesApi = {
  list:       () => api.get('/companies').then(r => r.data),
  fiscalYears: (id: string) => api.get(`/companies/${id}/fiscal-years`).then(r => r.data),
};

// ── Journal ───────────────────────────────────────────────────
export const journalApi = {
  list:   (cid: string, fyId?: string) =>
    api.get(`/companies/${cid}/entries`, { params: fyId ? { fiscal_year_id: fyId } : {} }).then(r => r.data),
  create: (data: any) =>
    api.post(`/companies/${data.company_id}/entries`, data).then(r => r.data),
};

// ── Accounts ──────────────────────────────────────────────────
export const accountsApi = {
  search: (cid: string, q: string) =>
    api.get(`/companies/${cid}/accounts/search`, { params: { q } }).then(r => r.data),
};

// ── Analytics ─────────────────────────────────────────────────
export const analyticsApi = {
  dashboard: (cid: string, fyId: string) =>
    api.get(`/companies/${cid}/analytics/dashboard`, { params: { fiscal_year_id: fyId } }).then(r => r.data),
  kpis: (cid: string, fyId: string) =>
    api.get(`/companies/${cid}/analytics/kpis`, { params: { fiscal_year_id: fyId } }).then(r => r.data),
  balance: (cid: string, fyId: string) =>
    api.get(`/companies/${cid}/analytics/balance`, { params: { fiscal_year_id: fyId } }).then(r => r.data),
};

// ── Documents ─────────────────────────────────────────────────
export const documentsApi = {
  list: (cid: string) => api.get(`/companies/${cid}/documents`).then(r => r.data),
  create: (cid: string, data: any) => api.post(`/companies/${cid}/documents`, data).then(r => r.data),
  upload: async (cid: string, file: { uri: string; type: string; name: string; doc_type: string }) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, type: file.type, name: file.name } as any);
    form.append('doc_type', file.doc_type);
    form.append('source', 'MOBILE_SCAN');
    return api.post(`/companies/${cid}/documents/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};

// ── Sync ──────────────────────────────────────────────────────
export const syncApi = {
  push: (cid: string, payload: any) =>
    api.post(`/companies/${cid}/sync/push`, payload).then(r => r.data),
  pull: (cid: string, lastSyncAt?: string) =>
    api.get(`/companies/${cid}/sync/pull`, { params: lastSyncAt ? { last_sync_at: lastSyncAt } : {} })
       .then(r => r.data),
};

// ── Connectivity ──────────────────────────────────────────────
export const isOnline = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
};

export const extractApiError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as any)?.message;
    if (Array.isArray(msg)) return msg.join(' · ');
    return msg ?? err.message;
  }
  return 'Erreur inattendue';
};

export default api;
