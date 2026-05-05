import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl,
  StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { analyticsApi, isOnline } from '../../lib/api/client';
import { useCompanyStore, useSyncStore } from '../../lib/store';
import { performSync } from '../../lib/db/offline';

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

const fmt = (n: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n >= 0 ? '' : ''}${n.toFixed(1)} %`;

type Tab = 'kpis' | 'balance' | 'evolution';

export default function AnalyticsScreen() {
  const { activeCompany, activeFiscalYear } = useCompanyStore();
  const { isSyncing, setIsSyncing, setLastSyncAt } = useSyncStore();

  const [tab, setTab]           = useState<Tab>('kpis');
  const [kpis, setKpis]         = useState<any>(null);
  const [balance, setBalance]   = useState<any[]>([]);
  const [evolution, setEvolution] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline]     = useState(true);

  const currency = activeCompany?.currency ?? 'EUR';

  const load = async () => {
    setLoading(true);
    const connected = await isOnline();
    setOnline(connected);
    if (connected && activeCompany && activeFiscalYear) {
      try {
        const [k, b, e] = await Promise.all([
          analyticsApi.kpis(activeCompany.id, activeFiscalYear.id),
          analyticsApi.balance(activeCompany.id, activeFiscalYear.id),
          analyticsApi.dashboard(activeCompany.id, activeFiscalYear.id),
        ]);
        setKpis(k);
        setBalance(b.accounts ?? []);
        setEvolution(e.evolution ?? []);
      } catch { /* silencieux */ }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeCompany, activeFiscalYear]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeCompany && !isSyncing) {
      setIsSyncing(true);
      try {
        await performSync(activeCompany.id);
        setLastSyncAt(new Date().toISOString());
      } finally { setIsSyncing(false); }
    }
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* ── Top bar ──────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Analyse</Text>
        {!online && <Ionicons name="cloud-offline-outline" size={16} color="#D97706" />}
      </View>

      {/* ── Tabs ─────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {(['kpis', 'balance', 'evolution'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'kpis' ? 'KPIs' : t === 'balance' ? 'Balance' : 'Évolution'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading
        ? <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
        : <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          >
            {tab === 'kpis' && kpis && <KpisTab kpis={kpis} currency={currency} />}
            {tab === 'balance' && <BalanceTab accounts={balance} currency={currency} />}
            {tab === 'evolution' && <EvolutionTab rows={evolution} currency={currency} />}

            {!kpis && tab === 'kpis' && !loading && (
              <View style={styles.empty}>
                <Ionicons name="bar-chart-outline" size={36} color="#CBD5E1" />
                <Text style={styles.emptyText}>Aucune donnée disponible</Text>
              </View>
            )}
          </ScrollView>
      }
    </View>
  );
}

/* ── KPIs Tab ─────────────────────────────────────────── */
const KpisTab = ({ kpis, currency }: { kpis: any; currency: string }) => (
  <>
    {/* Main result */}
    <View style={[styles.resultCard, kpis.resultat_net >= 0 ? styles.resultPos : styles.resultNeg]}>
      <Text style={styles.resultLbl}>Résultat net</Text>
      <Text style={[styles.resultVal, kpis.resultat_net >= 0 ? { color: '#059669' } : { color: '#DC2626' }]}>
        {kpis.resultat_net < 0 ? '− ' : ''}{fmt(Math.abs(kpis.resultat_net), currency)}
      </Text>
    </View>

    <Text style={styles.section}>Indicateurs</Text>
    <View style={styles.kpiList}>
      <KpiRow label="CAF" value={fmt(kpis.caf, currency)} icon="trending-up-outline" color="#10B981" />
      <KpiRow label="Trésorerie nette" value={fmt(kpis.tresorerie_nette, currency)} icon="wallet-outline" color={kpis.tresorerie_nette >= 0 ? '#3B82F6' : '#EF4444'} />
      <KpiRow label="Rentabilité nette" value={pct(kpis.rentabilite_nette_pct)} icon="analytics-outline" color="#8B5CF6" />
      <KpiRow label="Endettement" value={pct(kpis.endettement)} icon="bar-chart-outline" color="#F59E0B" />
      <KpiRow label="Seuil de rentabilité" value={fmt(kpis.seuil_rentabilite, currency)} icon="flag-outline" color="#64748B" />
    </View>

    {(kpis.alertes ?? []).length > 0 && (
      <>
        <Text style={styles.section}>Alertes</Text>
        {kpis.alertes.map((a: any, i: number) => (
          <View key={i} style={[styles.alert, a.severity === 'critique' ? styles.alertRed : styles.alertYellow]}>
            <Ionicons name="warning-outline" size={14} color={a.severity === 'critique' ? '#DC2626' : '#D97706'} />
            <Text style={styles.alertText}>{a.message}</Text>
          </View>
        ))}
      </>
    )}
  </>
);

const KpiRow = ({ label, value, icon, color }: { label: string; value: string; icon: any; color: string }) => (
  <View style={styles.kpiRow}>
    <View style={[styles.kpiIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={[styles.kpiValue, { color }]}>{value}</Text>
  </View>
);

/* ── Balance Tab ──────────────────────────────────────── */
const BalanceTab = ({ accounts, currency }: { accounts: any[]; currency: string }) => {
  const [filter, setFilter] = useState('');
  const visible = accounts.filter(a =>
    !filter || a.code.startsWith(filter) || a.label.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={14} color="#94A3B8" />
        <Text style={{ color: '#94A3B8', flex: 1, fontSize: 13 }}>Filtrer par compte…</Text>
      </View>

      <View style={styles.balHeader}>
        <Text style={[styles.balHdr, { flex: 2 }]}>Compte</Text>
        <Text style={[styles.balHdr, { width: 80, textAlign: 'right' }]}>Débit</Text>
        <Text style={[styles.balHdr, { width: 80, textAlign: 'right' }]}>Crédit</Text>
        <Text style={[styles.balHdr, { width: 70, textAlign: 'right' }]}>Solde</Text>
      </View>

      {accounts.length === 0
        ? <View style={styles.empty}><Text style={styles.emptyText}>Aucun compte mouvementé</Text></View>
        : accounts.map((a, i) => (
            <View key={i} style={styles.balRow}>
              <View style={{ flex: 2 }}>
                <Text style={styles.balCode}>{a.code}</Text>
                <Text style={styles.balLabel} numberOfLines={1}>{a.label}</Text>
              </View>
              <Text style={[styles.balAmt, { width: 80 }]}>{fmt(a.total_debit ?? 0, currency)}</Text>
              <Text style={[styles.balAmt, { width: 80 }]}>{fmt(a.total_credit ?? 0, currency)}</Text>
              <Text style={[styles.balAmt, { width: 70, color: (a.solde ?? 0) >= 0 ? '#059669' : '#DC2626' }]}>
                {fmt(Math.abs(a.solde ?? 0), currency)}
              </Text>
            </View>
          ))
      }
    </>
  );
};

/* ── Evolution Tab ────────────────────────────────────── */
const EvolutionTab = ({ rows, currency }: { rows: any[]; currency: string }) => (
  <>
    {rows.length === 0
      ? <View style={styles.empty}><Text style={styles.emptyText}>Aucune évolution disponible</Text></View>
      : rows.map((r, i) => (
          <View key={i} style={styles.evoCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={styles.evoMonth}>{r.month ?? r.period ?? `Période ${i + 1}`}</Text>
              <Text style={[styles.evoResult, (r.resultat ?? 0) >= 0 ? { color: '#059669' } : { color: '#DC2626' }]}>
                {fmt(r.resultat ?? 0, currency)}
              </Text>
            </View>
            <View style={styles.evoRow}>
              <Text style={styles.evoLabel}>Produits</Text>
              <Text style={[styles.evoValue, { color: '#10B981' }]}>{fmt(r.produits ?? 0, currency)}</Text>
            </View>
            <View style={styles.evoRow}>
              <Text style={styles.evoLabel}>Charges</Text>
              <Text style={[styles.evoValue, { color: '#EF4444' }]}>{fmt(r.charges ?? 0, currency)}</Text>
            </View>
          </View>
        ))
    }
  </>
);

const styles = StyleSheet.create({
  topBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  topTitle:{ fontSize: 17, fontWeight: '700', color: NAVY },

  tabBar:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tabItem:     { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: ORANGE },
  tabText:     { fontSize: 13, color: '#64748B', fontWeight: '500' },
  tabTextActive:{ color: ORANGE, fontWeight: '700' },

  resultCard: { borderRadius: 18, padding: 20, marginBottom: 14, alignItems: 'center' },
  resultPos:  { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1FAE5' },
  resultNeg:  { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
  resultLbl:  { fontSize: 11, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' },
  resultVal:  { fontSize: 26, fontWeight: '900', marginTop: 4 },

  section: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },

  kpiList: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  kpiRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiLabel:{ flex: 1, fontSize: 13, color: '#475569' },
  kpiValue:{ fontSize: 13, fontWeight: '700' },

  alert:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
  alertRed:   { backgroundColor: '#FEF2F2' },
  alertYellow:{ backgroundColor: '#FFFBEB' },
  alertText:  { flex: 1, fontSize: 12, color: '#374151' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 10, marginBottom: 10 },

  balHeader: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  balHdr:    { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  balRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, marginBottom: 4, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  balCode:   { fontSize: 12, fontWeight: '700', color: NAVY },
  balLabel:  { fontSize: 11, color: '#64748B' },
  balAmt:    { fontSize: 12, fontWeight: '600', color: '#475569', textAlign: 'right' },

  evoCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  evoMonth: { fontSize: 13, fontWeight: '700', color: NAVY },
  evoResult:{ fontSize: 13, fontWeight: '800' },
  evoRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  evoLabel: { fontSize: 12, color: '#64748B' },
  evoValue: { fontSize: 12, fontWeight: '600' },

  empty:     { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 14, color: '#CBD5E1', marginTop: 8 },
});
