import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl,
  StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons }      from '@expo/vector-icons';
import { analyticsApi, isOnline } from '../../lib/api/client';
import { useCompanyStore, useSyncStore, useAuthStore } from '../../lib/store';
import { performSync, getCachedEntries } from '../../lib/db/offline';

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

const fmt = (n: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export default function DashboardScreen() {
  const { activeCompany, activeFiscalYear } = useCompanyStore();
  const { user }                             = useAuthStore();
  const { isSyncing, setIsSyncing, lastSyncAt, setLastSyncAt } = useSyncStore();

  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline]         = useState(true);

  const load = async () => {
    setLoading(true);
    const connected = await isOnline();
    setOnline(connected);

    if (connected && activeCompany && activeFiscalYear) {
      try {
        const d = await analyticsApi.dashboard(activeCompany.id, activeFiscalYear.id);
        setData(d);
      } catch { /* silencieux */ }
    }
    setLoading(false);
  };

  const sync = async () => {
    if (!activeCompany || isSyncing) return;
    setIsSyncing(true);
    try {
      await performSync(activeCompany.id);
      setLastSyncAt(new Date().toISOString());
      await load();
    } finally { setIsSyncing(false); }
  };

  useEffect(() => { load(); }, [activeCompany, activeFiscalYear]);

  const onRefresh = async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  };

  const kpis = data?.kpis;
  const synthese = data?.synthese;
  const currency = activeCompany?.currency ?? 'EUR';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
    >
      {/* ── Header ──────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Bonjour, {user?.first_name} 👋</Text>
          <Text style={styles.company}>{activeCompany?.name ?? 'Aucune entreprise'}</Text>
          <Text style={styles.fy}>{activeFiscalYear?.label ?? '—'}</Text>
        </View>
        <TouchableOpacity onPress={sync} disabled={isSyncing} style={styles.syncBtn}>
          {isSyncing
            ? <ActivityIndicator size="small" color={ORANGE} />
            : <Ionicons name="sync-outline" size={20} color={ORANGE} />
          }
        </TouchableOpacity>
      </View>

      {/* ── Statut réseau ───────────────────────────────── */}
      {!online && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
          <Text style={styles.offlineText}>Mode hors ligne — les données locales sont utilisées</Text>
        </View>
      )}

      {loading && <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />}

      {synthese && (
        <>
          {/* ── Résultat net ────────────────────────────── */}
          <View style={[
            styles.resultCard,
            synthese.resultat_net >= 0 ? styles.resultPositive : styles.resultNegative,
          ]}>
            <Text style={styles.resultLabel}>Résultat net</Text>
            <Text style={[
              styles.resultValue,
              synthese.resultat_net >= 0 ? styles.textGreen : styles.textRed,
            ]}>
              {synthese.resultat_net < 0 ? '− ' : ''}{fmt(Math.abs(synthese.resultat_net), currency)}
            </Text>
            <Text style={styles.resultSub}>
              {synthese.nature === 'benefice' ? '✓ Bénéfice' : '⚠ Perte'}
            </Text>
          </View>

          {/* ── KPIs ────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Indicateurs clés</Text>
          <View style={styles.kpiGrid}>
            <KpiCard label="Produits"  value={fmt(synthese.total_produits, currency)} color="#10B981" />
            <KpiCard label="Charges"   value={fmt(synthese.total_charges,  currency)} color="#EF4444" />
            <KpiCard label="Trésorerie" value={fmt(synthese.tresorerie,    currency)} color={synthese.tresorerie >= 0 ? '#3B82F6' : '#EF4444'} />
            <KpiCard label="Clients"   value={fmt(synthese.clients_net,    currency)} color="#8B5CF6" />
          </View>

          {/* ── KPIs avancés ──────────────────────────────── */}
          {kpis && (
            <>
              <Text style={styles.sectionTitle}>Ratios financiers</Text>
              <View style={styles.ratioList}>
                <RatioRow label="CAF"            value={fmt(kpis.caf, currency)} />
                <RatioRow label="Rentabilité"    value={`${kpis.rentabilite_nette_pct} %`} />
                <RatioRow label="Endettement"    value={`${kpis.endettement} %`} />
                <RatioRow label="Seuil rent."    value={fmt(kpis.seuil_rentabilite, currency)} />
              </View>
            </>
          )}

          {/* ── Alertes ───────────────────────────────────── */}
          {(data.alertes ?? []).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Alertes</Text>
              {data.alertes.map((a: any, i: number) => (
                <View key={i} style={[styles.alert, a.severity === 'critique' ? styles.alertCritique : styles.alertAttention]}>
                  <Ionicons name="warning-outline" size={14} color={a.severity === 'critique' ? '#DC2626' : '#D97706'} />
                  <Text style={styles.alertText}>{a.message}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      {!loading && !synthese && activeCompany && (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={40} color="#CBD5E1" />
          <Text style={styles.emptyText}>Aucune donnée disponible</Text>
          <Text style={styles.emptySubText}>Saisissez des écritures pour voir l'analyse.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const KpiCard = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <View style={styles.kpiCard}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={[styles.kpiValue, { color }]}>{value}</Text>
  </View>
);

const RatioRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.ratioRow}>
    <Text style={styles.ratioLabel}>{label}</Text>
    <Text style={styles.ratioValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content:   { padding: 16, paddingBottom: 32 },

  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  welcome:   { fontSize: 18, fontWeight: '700', color: NAVY },
  company:   { fontSize: 14, fontWeight: '600', color: '#475569', marginTop: 2 },
  fy:        { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  syncBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 12 },
  offlineText:   { fontSize: 12, color: '#92400E', flex: 1 },

  resultCard:     { borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center' },
  resultPositive: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1FAE5' },
  resultNegative: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
  resultLabel:    { fontSize: 11, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultValue:    { fontSize: 28, fontWeight: '900', marginTop: 4 },
  resultSub:      { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  textGreen:      { color: '#059669' },
  textRed:        { color: '#DC2626' },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  kpiCard: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  kpiLabel:{ fontSize: 11, color: '#94A3B8', marginBottom: 4 },
  kpiValue:{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },

  ratioList: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  ratioRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  ratioLabel:{ fontSize: 13, color: '#475569' },
  ratioValue:{ fontSize: 13, fontWeight: '700', color: NAVY },

  alert:          { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
  alertCritique:  { backgroundColor: '#FEF2F2' },
  alertAttention: { backgroundColor: '#FFFBEB' },
  alertText:      { fontSize: 12, color: '#374151', flex: 1 },

  emptyState:  { alignItems: 'center', paddingVertical: 60 },
  emptyText:   { fontSize: 16, fontWeight: '600', color: '#CBD5E1', marginTop: 12 },
  emptySubText:{ fontSize: 13, color: '#CBD5E1', marginTop: 4 },
});
