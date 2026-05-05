import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, RefreshControl,
  StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { journalApi, accountsApi, isOnline } from '../../lib/api/client';
import { useCompanyStore, useSyncStore, useAuthStore } from '../../lib/store';
import {
  getCachedEntries, enqueueSync, performSync,
  searchCachedAccounts,
} from '../../lib/db/offline';

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().slice(0, 10);

type Line = { account_code: string; account_label: string; debit: string; credit: string };

export default function JournalScreen() {
  const { activeCompany, activeFiscalYear } = useCompanyStore();
  const { isSyncing, setIsSyncing, setLastSyncAt } = useSyncStore();

  const [entries, setEntries]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline]         = useState(true);
  const [showModal, setShowModal]   = useState(false);

  /* ── form state ────────────────────────────────────── */
  const [entryDate, setEntryDate]       = useState(today());
  const [reference, setReference]       = useState('');
  const [description, setDescription]   = useState('');
  const [lines, setLines]               = useState<Line[]>([
    { account_code: '', account_label: '', debit: '', credit: '' },
    { account_code: '', account_label: '', debit: '', credit: '' },
  ]);
  const [saving, setSaving]             = useState(false);
  const [accountSearch, setAccountSearch] = useState<{ idx: number; query: string } | null>(null);
  const [accountResults, setAccountResults] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const connected = await isOnline();
    setOnline(connected);
    if (connected && activeCompany && activeFiscalYear) {
      try {
        const data = await journalApi.list(activeCompany.id, activeFiscalYear.id);
        setEntries(data.entries ?? []);
        return;
      } catch { /* fallback offline */ }
    }
    const cached = await getCachedEntries();
    setEntries(cached);
    setLoading(false);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, [activeCompany, activeFiscalYear]);

  const sync = async () => {
    if (!activeCompany || isSyncing) return;
    setIsSyncing(true);
    try {
      await performSync(activeCompany.id);
      setLastSyncAt(new Date().toISOString());
      await load();
    } finally { setIsSyncing(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  };

  /* ── account search ─────────────────────────────────── */
  const searchAccounts = useCallback(async (query: string) => {
    if (query.length < 2) { setAccountResults([]); return; }
    const connected = await isOnline();
    if (connected && activeCompany) {
      try {
        const res = await accountsApi.search(activeCompany.id, query);
        setAccountResults(res ?? []);
        return;
      } catch { /* offline fallback */ }
    }
    const cached = await searchCachedAccounts(query);
    setAccountResults(cached);
  }, [activeCompany]);

  const pickAccount = (idx: number, acc: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], account_code: acc.code, account_label: acc.label };
    setLines(updated);
    setAccountSearch(null);
    setAccountResults([]);
  };

  /* ── balance check ──────────────────────────────────── */
  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  /* ── save entry ─────────────────────────────────────── */
  const saveEntry = async () => {
    if (!balanced) { Alert.alert('Erreur', 'L\'écriture n\'est pas équilibrée.'); return; }
    if (!description.trim()) { Alert.alert('Erreur', 'Le libellé est requis.'); return; }
    if (!activeCompany || !activeFiscalYear) return;

    const payload = {
      company_id:      activeCompany.id,
      fiscal_year_id:  activeFiscalYear.id,
      entry_date:      entryDate,
      reference:       reference.trim() || undefined,
      description:     description.trim(),
      lines: lines
        .filter(l => l.account_code)
        .map(l => ({
          account_code: l.account_code,
          debit:  parseFloat(l.debit)  || 0,
          credit: parseFloat(l.credit) || 0,
          label:  description.trim(),
        })),
    };

    setSaving(true);
    const connected = await isOnline();
    try {
      if (connected) {
        await journalApi.create(payload);  // company_id is inside payload
      } else {
        await enqueueSync('CREATE', 'journal_entries', payload);
      }
      setShowModal(false);
      resetForm();
      await load();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de sauvegarder');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setEntryDate(today());
    setReference('');
    setDescription('');
    setLines([
      { account_code: '', account_label: '', debit: '', credit: '' },
      { account_code: '', account_label: '', debit: '', credit: '' },
    ]);
  };

  const addLine = () => setLines([...lines, { account_code: '', account_label: '', debit: '', credit: '' }]);
  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, idx) => idx !== i));
  };

  const updateLine = (i: number, field: keyof Line, value: string) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    setLines(updated);
  };

  /* ── render ─────────────────────────────────────────── */
  const renderEntry = ({ item }: { item: any }) => (
    <View style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <Text style={styles.entryDate}>{item.entry_date?.slice(0, 10) ?? '—'}</Text>
        {item.reference && <Text style={styles.entryRef}>{item.reference}</Text>}
        <View style={[styles.statusBadge, item.status === 'validated' ? styles.badgeValid : styles.badgeDraft]}>
          <Text style={styles.statusText}>{item.status === 'validated' ? 'Validée' : 'Brouillon'}</Text>
        </View>
      </View>
      <Text style={styles.entryDesc} numberOfLines={1}>{item.description}</Text>
      {(item.lines ?? []).map((l: any, i: number) => (
        <View key={i} style={styles.lineRow}>
          <Text style={styles.lineCode}>{l.account?.code ?? l.account_code}</Text>
          <Text style={styles.lineLabel} numberOfLines={1}>{l.account?.label ?? l.label ?? ''}</Text>
          <Text style={[styles.lineAmt, { color: '#10B981' }]}>{l.debit > 0 ? fmt(l.debit) : ''}</Text>
          <Text style={[styles.lineAmt, { color: '#EF4444' }]}>{l.credit > 0 ? fmt(l.credit) : ''}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* ── Top bar ──────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Journal</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={sync} disabled={isSyncing} style={styles.iconBtn}>
            {isSyncing
              ? <ActivityIndicator size="small" color={ORANGE} />
              : <Ionicons name="sync-outline" size={18} color={ORANGE} />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { resetForm(); setShowModal(true); }} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {!online && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={13} color="#92400E" />
          <Text style={styles.offlineText}>Hors ligne — données locales</Text>
        </View>
      )}

      {loading
        ? <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
        : <FlatList
            data={entries}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderEntry}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="book-outline" size={36} color="#CBD5E1" />
                <Text style={styles.emptyText}>Aucune écriture</Text>
              </View>
            }
          />
      }

      {/* ── Create modal ─────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nouvelle écriture</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Row label="Date">
              <TextInput style={styles.input} value={entryDate} onChangeText={setEntryDate} placeholder="YYYY-MM-DD" />
            </Row>
            <Row label="Référence">
              <TextInput style={styles.input} value={reference} onChangeText={setReference} placeholder="Optionnel" />
            </Row>
            <Row label="Libellé *">
              <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description de l'écriture" />
            </Row>

            <Text style={styles.linesTitle}>Lignes</Text>
            <View style={styles.linesHeader}>
              <Text style={[styles.linesHdr, { flex: 2 }]}>Compte</Text>
              <Text style={[styles.linesHdr, { width: 70 }]}>Débit</Text>
              <Text style={[styles.linesHdr, { width: 70 }]}>Crédit</Text>
              <View style={{ width: 24 }} />
            </View>

            {lines.map((line, idx) => (
              <View key={idx}>
                <View style={styles.lineInputRow}>
                  <TouchableOpacity
                    style={[styles.input, { flex: 2, justifyContent: 'center' }]}
                    onPress={() => {
                      setAccountSearch({ idx, query: line.account_code });
                      setAccountResults([]);
                    }}
                  >
                    <Text style={{ color: line.account_code ? NAVY : '#94A3B8', fontSize: 13 }} numberOfLines={1}>
                      {line.account_code ? `${line.account_code} ${line.account_label}` : 'Choisir…'}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, { width: 70 }]}
                    value={line.debit}
                    onChangeText={v => updateLine(idx, 'debit', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                  <TextInput
                    style={[styles.input, { width: 70 }]}
                    value={line.credit}
                    onChangeText={v => updateLine(idx, 'credit', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                  <TouchableOpacity onPress={() => removeLine(idx)} style={{ width: 24, alignItems: 'center' }}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                {accountSearch?.idx === idx && (
                  <View style={styles.accountSearch}>
                    <TextInput
                      style={styles.searchInput}
                      value={accountSearch.query}
                      onChangeText={q => {
                        setAccountSearch({ idx, query: q });
                        searchAccounts(q);
                      }}
                      placeholder="Rechercher un compte…"
                      autoFocus
                    />
                    {accountResults.map((acc: any) => (
                      <TouchableOpacity key={acc.id} style={styles.accountRow} onPress={() => pickAccount(idx, acc)}>
                        <Text style={styles.accCode}>{acc.code}</Text>
                        <Text style={styles.accLabel} numberOfLines={1}>{acc.label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => { setAccountSearch(null); setAccountResults([]); }} style={styles.cancelSearch}>
                      <Text style={{ color: '#64748B', fontSize: 12 }}>Annuler</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}

            <TouchableOpacity onPress={addLine} style={styles.addLine}>
              <Ionicons name="add-circle-outline" size={16} color={ORANGE} />
              <Text style={{ color: ORANGE, fontSize: 13, marginLeft: 4 }}>Ajouter une ligne</Text>
            </TouchableOpacity>

            {/* Balance indicator */}
            <View style={[styles.balanceRow, balanced ? styles.balanceOk : styles.balanceNok]}>
              <Text style={styles.balanceLbl}>Débit  {fmt(totalDebit)}</Text>
              <Text style={styles.balanceLbl}>Crédit {fmt(totalCredit)}</Text>
              <Text style={balanced ? styles.balanceGood : styles.balanceBad}>
                {balanced ? '✓ Équilibré' : '✗ Non équilibré'}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
              <Text style={styles.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!balanced || saving) && { opacity: 0.5 }]}
              onPress={saveEntry}
              disabled={!balanced || saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Enregistrer</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  topBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  topTitle:{ fontSize: 17, fontWeight: '700', color: NAVY },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  addBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', padding: 8, paddingHorizontal: 16 },
  offlineText:   { fontSize: 11, color: '#92400E' },

  entryCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  entryDate:   { fontSize: 12, fontWeight: '600', color: '#475569' },
  entryRef:    { fontSize: 11, color: '#94A3B8' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 'auto' },
  badgeValid:  { backgroundColor: '#ECFDF5' },
  badgeDraft:  { backgroundColor: '#F8FAFC' },
  statusText:  { fontSize: 10, fontWeight: '600', color: '#64748B' },
  entryDesc:   { fontSize: 13, color: NAVY, fontWeight: '600', marginBottom: 6 },
  lineRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  lineCode:    { fontSize: 11, fontWeight: '700', color: '#475569', width: 44 },
  lineLabel:   { flex: 1, fontSize: 11, color: '#64748B' },
  lineAmt:     { fontSize: 11, fontWeight: '700', width: 60, textAlign: 'right' },

  empty:     { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#CBD5E1', marginTop: 10 },

  modal:       { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle:  { fontSize: 17, fontWeight: '700', color: NAVY },

  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 5 },
  input: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    padding: 10, fontSize: 13, color: NAVY, backgroundColor: '#fff',
  },

  linesTitle:  { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  linesHeader: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  linesHdr:    { fontSize: 10, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' },
  lineInputRow:{ flexDirection: 'row', gap: 4, marginBottom: 6, alignItems: 'center' },

  accountSearch: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6, overflow: 'hidden' },
  searchInput:   { padding: 10, fontSize: 13, color: NAVY, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  accountRow:    { flexDirection: 'row', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  accCode:       { fontSize: 12, fontWeight: '700', color: NAVY, width: 50 },
  accLabel:      { flex: 1, fontSize: 12, color: '#475569' },
  cancelSearch:  { padding: 10, alignItems: 'center' },

  addLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 12 },

  balanceRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, padding: 12, marginBottom: 8 },
  balanceOk:   { backgroundColor: '#ECFDF5' },
  balanceNok:  { backgroundColor: '#FEF2F2' },
  balanceLbl:  { fontSize: 12, fontWeight: '600', color: '#64748B' },
  balanceGood: { fontSize: 12, fontWeight: '700', color: '#059669' },
  balanceBad:  { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  modalFooter: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn:   { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#F1F5F9' },
  cancelTxt:   { fontSize: 14, fontWeight: '600', color: '#64748B' },
  saveBtn:     { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: ORANGE },
  saveTxt:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});
