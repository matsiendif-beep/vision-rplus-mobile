// ============================================================
//  VISION R+ Mobile — Base SQLite locale (offline)
// ============================================================
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { syncApi, isOnline } from '../api/client';

const db = SQLite.openDatabaseSync('vision_rplus.db');

// ── Initialisation des tables locales ─────────────────────────
export const initDb = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id           TEXT PRIMARY KEY,
      operation    TEXT NOT NULL,
      table_name   TEXT NOT NULL,
      record_id    TEXT NOT NULL,
      payload      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS journal_entries_cache (
      id             TEXT PRIMARY KEY,
      company_id     TEXT NOT NULL,
      fiscal_year_id TEXT NOT NULL,
      journal_type   TEXT NOT NULL,
      entry_date     TEXT NOT NULL,
      libelle        TEXT NOT NULL,
      reference      TEXT,
      status         TEXT NOT NULL DEFAULT 'brouillon',
      total_debit    REAL NOT NULL DEFAULT 0,
      total_credit   REAL NOT NULL DEFAULT 0,
      synced         INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts_cache (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      label      TEXT NOT NULL,
      type       TEXT NOT NULL,
      company_id TEXT,
      system     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
};

// ── Ajouter à la file de synchronisation ─────────────────────
export const enqueueSync = (
  operation: 'create' | 'update' | 'delete',
  tableName: string,
  recordId: string,
  payload: object,
) => {
  const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  db.runSync(
    `INSERT INTO sync_queue (id, operation, table_name, record_id, payload) VALUES (?, ?, ?, ?, ?)`,
    [id, operation, tableName, recordId, JSON.stringify(payload)],
  );
};

// ── Récupérer les items en attente ────────────────────────────
export const getPendingSync = () => {
  return db.getAllSync<any>(
    `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`,
  );
};

// ── Marquer comme synchronisé ─────────────────────────────────
export const markSynced = (id: string) => {
  db.runSync(
    `UPDATE sync_queue SET status = 'synced', synced_at = datetime('now') WHERE id = ?`,
    [id],
  );
};

// ── Synchronisation automatique ───────────────────────────────
export const performSync = async (companyId: string): Promise<{
  pushed: number; pulled: boolean; errors: number;
}> => {
  if (!(await isOnline())) return { pushed: 0, pulled: false, errors: 0 };

  const pending  = getPendingSync();
  let errors = 0;

  if (pending.length > 0) {
    const deviceId = (await SecureStore.getItemAsync('device_id')) ?? `device_${Date.now()}`;
    await SecureStore.setItemAsync('device_id', deviceId);

    try {
      const result = await syncApi.push(companyId, {
        device_id:  deviceId,
        operations: pending.map(item => ({
          operation:      item.operation,
          table_name:     item.table_name,
          record_id:      item.record_id,
          payload:        JSON.parse(item.payload),
          client_version: 1,
        })),
      });

      for (const r of result.results ?? []) {
        if (r.status === 'synced') {
          const syncItem = pending.find(p => p.record_id === r.record_id);
          if (syncItem) markSynced(syncItem.id);
        } else { errors++; }
      }
    } catch { errors++; }
  }

  // Pull les données serveur
  const lastSyncAt = db.getFirstSync<any>(`SELECT value FROM meta WHERE key = 'last_sync_at'`)?.value;
  try {
    const pulled = await syncApi.pull(companyId, lastSyncAt);
    // Mettre à jour le cache local
    await updateLocalCache(pulled.data);
    db.runSync(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('last_sync_at', ?)`,
      [new Date().toISOString()],
    );
    return { pushed: pending.length - errors, pulled: true, errors };
  } catch {
    return { pushed: pending.length - errors, pulled: false, errors };
  }
};

// ── Mettre à jour le cache local depuis données serveur ───────
const updateLocalCache = async (data: any) => {
  // Écritures
  for (const entry of data.journal_entries ?? []) {
    db.runSync(`
      INSERT OR REPLACE INTO journal_entries_cache
        (id, company_id, fiscal_year_id, journal_type, entry_date, libelle, reference, status, total_debit, total_credit, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      entry.id, entry.company_id, entry.fiscal_year_id, entry.journal_type,
      entry.entry_date, entry.libelle, entry.reference ?? null, entry.status,
      entry.total_debit, entry.total_credit,
    ]);
  }
  // Comptes
  for (const account of data.accounts ?? []) {
    db.runSync(`
      INSERT OR REPLACE INTO accounts_cache (id, code, label, type, company_id, system)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [account.id, account.code, account.label, account.type, account.company_id ?? null, account.system]);
  }
};

// ── Lire les écritures depuis cache ───────────────────────────
export const getCachedEntries = (companyId: string, limit = 50) => {
  return db.getAllSync<any>(
    `SELECT * FROM journal_entries_cache WHERE company_id = ? ORDER BY entry_date DESC LIMIT ?`,
    [companyId, limit],
  );
};

// ── Recherche comptes depuis cache ────────────────────────────
export const searchCachedAccounts = (q: string, companyId?: string) => {
  return db.getAllSync<any>(`
    SELECT * FROM accounts_cache
    WHERE (code LIKE ? OR label LIKE ?)
      AND (company_id = ? OR company_id IS NULL)
    LIMIT 20
  `, [`%${q}%`, `%${q}%`, companyId ?? null]);
};

export default db;
