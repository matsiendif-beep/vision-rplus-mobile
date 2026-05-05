import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { syncApi, isOnline } from '../api/client';

const K = {
  queue:    '@vrp/sync_queue',
  entries:  (cid: string) => `@vrp/entries:${cid}`,
  allEntries: '@vrp/entries:all',
  accounts: (cid: string) => `@vrp/accounts:${cid}`,
  lastSync: '@vrp/meta:last_sync_at',
};

// ── No-op for compatibility with _layout.tsx ─────────────────
export const initDb = () => { /* AsyncStorage needs no init */ };

// ── Helpers ───────────────────────────────────────────────────
const getJson = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

const setJson = async (key: string, value: unknown) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

// ── Enqueue offline operation ─────────────────────────────────
export const enqueueSync = async (
  operation: string,
  tableName: string,
  payload: object,
): Promise<void> => {
  const queue = await getJson<any[]>(K.queue, []);
  queue.push({
    id:         `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    operation:  operation.toUpperCase(),
    table_name: tableName,
    payload,
    status:     'pending',
    created_at: new Date().toISOString(),
  });
  await setJson(K.queue, queue);
};

// ── Full sync push + pull ─────────────────────────────────────
export const performSync = async (companyId: string): Promise<{
  pushed: number; pulled: boolean; errors: number;
}> => {
  if (!(await isOnline())) return { pushed: 0, pulled: false, errors: 0 };

  const queue   = await getJson<any[]>(K.queue, []);
  const pending = queue.filter(i => i.status === 'pending');
  let errors    = 0;

  if (pending.length > 0) {
    let deviceId = await SecureStore.getItemAsync('device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}`;
      await SecureStore.setItemAsync('device_id', deviceId);
    }
    try {
      const result = await syncApi.push(companyId, {
        device_id:  deviceId,
        operations: pending.map(i => ({
          operation:  i.operation,
          table_name: i.table_name,
          payload:    i.payload,
        })),
      });
      const synced = new Set(
        (result.results ?? []).filter((r: any) => r.status === 'synced').map((r: any) => r.record_id)
      );
      const updated = queue.map(i => {
        if (i.status === 'pending' && synced.has(i.payload?.id)) {
          return { ...i, status: 'synced' };
        }
        return i;
      });
      await setJson(K.queue, updated);
    } catch { errors++; }
  }

  const lastSyncAt = await AsyncStorage.getItem(K.lastSync);
  try {
    const pulled = await syncApi.pull(companyId, lastSyncAt ?? undefined);
    await updateLocalCache(companyId, pulled.data ?? {});
    await AsyncStorage.setItem(K.lastSync, new Date().toISOString());
    return { pushed: pending.length - errors, pulled: true, errors };
  } catch {
    return { pushed: pending.length - errors, pulled: false, errors };
  }
};

const updateLocalCache = async (companyId: string, data: any) => {
  if ((data.journal_entries ?? []).length > 0) {
    const existing = await getJson<any[]>(K.entries(companyId), []);
    const map = new Map(existing.map((e: any) => [e.id, e]));
    for (const e of data.journal_entries) map.set(e.id, e);
    await setJson(K.entries(companyId), [...map.values()]);
  }
  if ((data.accounts ?? []).length > 0) {
    const existing = await getJson<any[]>(K.accounts(companyId), []);
    const map = new Map(existing.map((a: any) => [a.id, a]));
    for (const a of data.accounts) map.set(a.id, a);
    await setJson(K.accounts(companyId), [...map.values()]);
  }
};

// ── Read cached entries ───────────────────────────────────────
export const getCachedEntries = async (companyId?: string, limit = 50): Promise<any[]> => {
  const all = companyId
    ? await getJson<any[]>(K.entries(companyId), [])
    : await getJson<any[]>(K.allEntries, []);
  return all.slice(0, limit);
};

// ── Search accounts from cache ────────────────────────────────
export const searchCachedAccounts = async (q: string, companyId?: string): Promise<any[]> => {
  const accounts = companyId
    ? await getJson<any[]>(K.accounts(companyId), [])
    : [];
  const lower = q.toLowerCase();
  return accounts
    .filter((a: any) =>
      a.code?.startsWith(q) || a.label?.toLowerCase().includes(lower)
    )
    .slice(0, 20);
};
