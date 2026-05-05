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

const fmt = (n: number, currency = 'XAF') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)} %`;

type Tab = 'kpis' | 'bilan' | 'resultat' | 'balance' | 'grandlivre';

export default function AnalyticsScreen() {
  const { activeCompany, activeFiscalYear } = useCompanyStore();
  const { isSyncing, setIsSyncing, setLastSyncAt } = useSyncStore();

  const [tab, setTab]               = useState<Tab>('kpis');
  const [kpis, setKpis]             = useState<any>(null);
  const [bilan, setBilan]           = useState<any>(null);
  const [resultat, setResultat]     = useState<any>(null);
  const [balance, setBalance]       = useState<any[]>([]);
  const [grandLivre, setGrandLivre] = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline]         = useState(true);

  const currency = activeCompany?.currency ?? 'XAF';

  const load = async () => {
    setLoading(true);
    const connected = await isOnline();
    setOnline(connected);
    if (connected && activeCompany && activeFiscalYear) {
      try {
        const [k, bi, cr, bal] = await Promise.all([
          analyticsApi.kpis(activeCompany.id, activeFiscalYear.id).catch(() => null),
          analyticsApi.bilan(activeCompany.id, activeFiscalYear.id).catch(() => null),
          analyticsApi.compteResultat(activeCompany.id, activeFiscalYear.id).catch(() => null),
          analyticsApi.balance(activeCompany.id, activeFiscalYear.id).catch(() => null),
        ]);
        setKpis(k);
        setBilan(bi);
        setResultat(cr);
        setBalance(bal?.accounts ?? []);
      } catch { /* silencieux */ }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeCompany, activeFiscalYear]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeCompany && !isSyncing) {
      setIsSyncing(true);
      try { await performSync(activeCompany.id); setLastSyncAt(new Date().toISOString()); }
      finally { setIsSyncing(false); }
    }
    await load();
    setRefreshing(false);
  };

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'kpis',      label: 'KPIs',       icon: 'analytics-outline' },
    { key: 'bilan',     label: 'Bilan',      icon: 'stats-chart-outline' },
    { key: 'resultat',  label: 'Résultat',   icon: 'trending-up-outline' },
    { key: 'balance',   label: 'Balance',    icon: 'list-outline' },
    { key: 'grandlivre',label: 'G. Livre',   icon: 'book-outline' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Analyse financière</Text>
        {!online && <Ionicons name="cloud-offline-outline" size={16} color="#D97706" />}
      </View>

      {/* ── Tabs ───────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabItem, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={14} color={tab === t.key ? ORANGE : '#94A3B8'} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading
        ? <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
        : <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          >
            {tab === 'kpis'       && <KpisTab kpis={kpis} currency={currency} />}
            {tab === 'bilan'      && <BilanTab bilan={bilan} currency={currency} />}
            {tab === 'resultat'   && <ResultatTab resultat={resultat} currency={currency} />}
            {tab === 'balance'    && <BalanceTab accounts={balance} currency={currency} />}
            {tab === 'grandlivre' && <GrandLivreTab cid={activeCompany?.id} fyId={activeFiscalYear?.id} currency={currency} />}
          </ScrollView>
      }
    </View>
  );
}

/* ── KPIs ─────────────────────────────────────────────────── */
const KpisTab = ({ kpis, currency }: { kpis: any; currency: string }) => {
  if (!kpis) return <Empty text="Aucun KPI disponible" />;
  return (
    <>
      <View style={[styles.resultCard, kpis.resultat_net >= 0 ? styles.resultPos : styles.resultNeg]}>
        <Text style={styles.resultLbl}>Résultat net</Text>
        <Text style={[styles.resultVal, { color: kpis.resultat_net >= 0 ? '#059669' : '#DC2626' }]}>
          {kpis.resultat_net < 0 ? '− ' : ''}{fmt(Math.abs(kpis.resultat_net), currency)}
        </Text>
      </View>
      <Text style={styles.section}>Indicateurs clés</Text>
      <View style={styles.kpiList}>
        <KpiRow label="CAF"                value={fmt(kpis.caf ?? 0, currency)}              icon="trending-up-outline"   color="#10B981" />
        <KpiRow label="Trésorerie nette"   value={fmt(kpis.tresorerie_nette ?? 0, currency)} icon="wallet-outline"        color={(kpis.tresorerie_nette ?? 0) >= 0 ? '#3B82F6' : '#EF4444'} />
        <KpiRow label="Rentabilité nette"  value={pct(kpis.rentabilite_nette_pct ?? 0)}      icon="pie-chart-outline"     color="#8B5CF6" />
        <KpiRow label="Endettement"        value={pct(kpis.endettement ?? 0)}                icon="bar-chart-outline"     color="#F59E0B" />
        <KpiRow label="Seuil rentabilité"  value={fmt(kpis.seuil_rentabilite ?? 0, currency)} icon="flag-outline"         color="#64748B" />
        <KpiRow label="Total produits"     value={fmt(kpis.total_produits ?? 0, currency)}   icon="arrow-up-outline"      color="#10B981" />
        <KpiRow label="Total charges"      value={fmt(kpis.total_charges ?? 0, currency)}    icon="arrow-down-outline"    color="#EF4444" />
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
};

const KpiRow = ({ label, value, icon, color }: { label: string; value: string; icon: any; color: string }) => (
  <View style={styles.kpiRow}>
    <View style={[styles.kpiIcon, { backgroundColor: color + '22' }]}>
      <Ionicons name={icon} size={15} color={color} />
    </View>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={[styles.kpiValue, { color }]}>{value}</Text>
  </View>
);

/* ── Bilan ────────────────────────────────────────────────── */
const BilanTab = ({ bilan, currency }: { bilan: any; currency: string }) => {
  if (!bilan) return <Empty text="Bilan non disponible — saisissez des écritures validées" />;
  const actif  = bilan.actif  ?? {};
  const passif = bilan.passif ?? {};
  return (
    <>
      <View style={styles.bilanHeader}>
        <Text style={styles.bilanTitle}>Bilan</Text>
        <View style={[styles.equilibreBadge, bilan.equilibre ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={styles.equilibreText}>{bilan.equilibre ? '✓ Équilibré' : '✗ Non équilibré'}</Text>
        </View>
      </View>

      {/* ACTIF */}
      <Text style={styles.section}>ACTIF</Text>
      <View style={styles.bilanCard}>
        {Object.entries(actif).map(([key, val]: any) =>
          typeof val === 'object' ? (
            <View key={key}>
              <Text style={styles.bilanGroup}>{key.replace(/_/g, ' ').toUpperCase()}</Text>
              {Object.entries(val).map(([k2, v2]: any) => (
                <BilanRow key={k2} label={k2} value={fmt(v2, currency)} />
              ))}
            </View>
          ) : key !== 'total' ? <BilanRow key={key} label={key} value={fmt(val, currency)} /> : null
        )}
        <View style={styles.bilanTotal}>
          <Text style={styles.bilanTotalLabel}>TOTAL ACTIF</Text>
          <Text style={styles.bilanTotalValue}>{fmt(actif.total ?? 0, currency)}</Text>
        </View>
      </View>

      {/* PASSIF */}
      <Text style={styles.section}>PASSIF</Text>
      <View style={styles.bilanCard}>
        {Object.entries(passif).map(([key, val]: any) =>
          typeof val === 'object' ? (
            <View key={key}>
              <Text style={styles.bilanGroup}>{key.replace(/_/g, ' ').toUpperCase()}</Text>
              {Object.entries(val).map(([k2, v2]: any) => (
                <BilanRow key={k2} label={k2} value={fmt(v2, currency)} />
              ))}
            </View>
          ) : key !== 'total' ? <BilanRow key={key} label={key} value={fmt(val, currency)} /> : null
        )}
        <View style={styles.bilanTotal}>
          <Text style={styles.bilanTotalLabel}>TOTAL PASSIF</Text>
          <Text style={styles.bilanTotalValue}>{fmt(passif.total ?? 0, currency)}</Text>
        </View>
      </View>
    </>
  );
};

const BilanRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.bilanRow}>
    <Text style={styles.bilanLabel} numberOfLines={1}>{label.replace(/_/g, ' ')}</Text>
    <Text style={styles.bilanValue}>{value}</Text>
  </View>
);

/* ── Compte de résultat ───────────────────────────────────── */
const ResultatTab = ({ resultat, currency }: { resultat: any; currency: string }) => {
  if (!resultat) return <Empty text="Compte de résultat non disponible" />;
  const produits = resultat.produits ?? {};
  const charges  = resultat.charges  ?? {};
  return (
    <>
      <Text style={styles.section}>PRODUITS</Text>
      <View style={styles.bilanCard}>
        {Object.entries(produits).map(([k, v]: any) =>
          k !== 'total' ? <BilanRow key={k} label={k} value={fmt(v, currency)} /> : null
        )}
        <View style={styles.bilanTotal}>
          <Text style={styles.bilanTotalLabel}>TOTAL PRODUITS</Text>
          <Text style={[styles.bilanTotalValue, { color: '#059669' }]}>{fmt(produits.total ?? 0, currency)}</Text>
        </View>
      </View>

      <Text style={styles.section}>CHARGES</Text>
      <View style={styles.bilanCard}>
        {Object.entries(charges).map(([k, v]: any) =>
          k !== 'total' ? <BilanRow key={k} label={k} value={fmt(v, currency)} /> : null
        )}
        <View style={styles.bilanTotal}>
          <Text style={styles.bilanTotalLabel}>TOTAL CHARGES</Text>
          <Text style={[styles.bilanTotalValue, { color: '#DC2626' }]}>{fmt(charges.total ?? 0, currency)}</Text>
        </View>
      </View>

      <View style={[styles.resultCard, (resultat.resultat_net ?? 0) >= 0 ? styles.resultPos : styles.resultNeg]}>
        <Text style={styles.resultLbl}>RÉSULTAT NET</Text>
        <Text style={[styles.resultVal, { color: (resultat.resultat_net ?? 0) >= 0 ? '#059669' : '#DC2626' }]}>
          {fmt(resultat.resultat_net ?? 0, currency)}
        </Text>
        <Text style={styles.resultLbl}>{(resultat.resultat_net ?? 0) >= 0 ? 'BÉNÉFICE' : 'PERTE'}</Text>
      </View>
    </>
  );
};

/* ── Balance générale ─────────────────────────────────────── */
const BalanceTab = ({ accounts, currency }: { accounts: any[]; currency: string }) => {
  if (accounts.length === 0) return <Empty text="Balance vide — aucun compte mouvementé" />;
  const totalD = accounts.reduce((s, a) => s + (a.total_debit ?? 0), 0);
  const totalC = accounts.reduce((s, a) => s + (a.total_credit ?? 0), 0);
  return (
    <>
      <View style={styles.balHeader}>
        <Text style={[styles.balHdr, { flex: 2 }]}>Compte</Text>
        <Text style={[styles.balHdr, { width: 76, textAlign: 'right' }]}>Débit</Text>
        <Text style={[styles.balHdr, { width: 76, textAlign: 'right' }]}>Crédit</Text>
      </View>
      {accounts.map((a, i) => (
        <View key={i} style={styles.balRow}>
          <View style={{ flex: 2 }}>
            <Text style={styles.balCode}>{a.code}</Text>
            <Text style={styles.balLabelText} numberOfLines={1}>{a.label}</Text>
          </View>
          <Text style={[styles.balAmt, { width: 76, color: '#059669' }]}>{fmt(a.total_debit ?? 0, currency)}</Text>
          <Text style={[styles.balAmt, { width: 76, color: '#EF4444' }]}>{fmt(a.total_credit ?? 0, currency)}</Text>
        </View>
      ))}
      <View style={styles.balTotals}>
        <Text style={styles.balTotalLabel}>TOTAUX</Text>
        <Text style={[styles.balTotalAmt, { color: '#059669' }]}>{fmt(totalD, currency)}</Text>
        <Text style={[styles.balTotalAmt, { color: '#EF4444' }]}>{fmt(totalC, currency)}</Text>
      </View>
    </>
  );
};

/* ── Grand Livre ──────────────────────────────────────────── */
const GrandLivreTab = ({ cid, fyId, currency }: { cid?: string; fyId?: string; currency: string }) => {
  const [data, setData]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cid || !fyId) return;
    setLoading(true);
    analyticsApi.grandLivre(cid, fyId)
      .then(r => setData(r.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cid, fyId]);

  if (loading) return <ActivityIndicator color={ORANGE} style={{ marginTop: 30 }} />;
  if (data.length === 0) return <Empty text="Grand livre vide" />;

  return (
    <>
      {data.map((account: any, i: number) => (
        <View key={i} style={styles.glAccount}>
          <View style={styles.glAccountHeader}>
            <Text style={styles.glCode}>{account.code}</Text>
            <Text style={styles.glAccountLabel} numberOfLines={1}>{account.label}</Text>
            <Text style={[styles.glSolde, { color: (account.solde ?? 0) >= 0 ? '#059669' : '#DC2626' }]}>
              {fmt(Math.abs(account.solde ?? 0), currency)}
            </Text>
          </View>
          {(account.lines ?? []).map((l: any, j: number) => (
            <View key={j} style={styles.glLine}>
              <Text style={styles.glDate}>{l.entry_date?.slice(0, 10)}</Text>
              <Text style={styles.glLibelle} numberOfLines={1}>{l.libelle ?? l.description}</Text>
              <Text style={[styles.glAmt, { color: l.debit > 0 ? '#059669' : '#EF4444' }]}>
                {l.debit > 0 ? fmt(l.debit, currency) : fmt(l.credit, currency)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
};

const Empty = ({ text }: { text: string }) => (
  <View style={styles.empty}>
    <Ionicons name="bar-chart-outline" size={36} color="#CBD5E1" />
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  topBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  topTitle:{ fontSize: 17, fontWeight: '700', color: NAVY },

  tabBar:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', maxHeight: 48 },
  tabItem:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 12 },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: ORANGE },
  tabText:     { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  tabTextActive: { color: ORANGE, fontWeight: '700' },

  resultCard: { borderRadius: 18, padding: 20, marginBottom: 14, alignItems: 'center' },
  resultPos:  { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1FAE5' },
  resultNeg:  { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
  resultLbl:  { fontSize: 11, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultVal:  { fontSize: 26, fontWeight: '900', marginVertical: 4 },

  section: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },

  kpiList: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  kpiRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  kpiIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiLabel:{ flex: 1, fontSize: 13, color: '#475569' },
  kpiValue:{ fontSize: 13, fontWeight: '700' },

  alert:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
  alertRed:   { backgroundColor: '#FEF2F2' },
  alertYellow:{ backgroundColor: '#FFFBEB' },
  alertText:  { flex: 1, fontSize: 12, color: '#374151' },

  bilanHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bilanTitle:   { fontSize: 17, fontWeight: '800', color: NAVY },
  equilibreBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeGreen:   { backgroundColor: '#ECFDF5' },
  badgeRed:     { backgroundColor: '#FEF2F2' },
  equilibreText:{ fontSize: 12, fontWeight: '700', color: '#374151' },
  bilanCard:    { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  bilanGroup:   { fontSize: 10, fontWeight: '700', color: '#94A3B8', backgroundColor: '#F8FAFC', padding: 8, paddingHorizontal: 12, letterSpacing: 0.5 },
  bilanRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  bilanLabel:   { flex: 1, fontSize: 13, color: '#475569', textTransform: 'capitalize' },
  bilanValue:   { fontSize: 13, fontWeight: '600', color: NAVY },
  bilanTotal:   { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#F8FAFC' },
  bilanTotalLabel: { fontSize: 12, fontWeight: '700', color: '#475569' },
  bilanTotalValue: { fontSize: 14, fontWeight: '900', color: NAVY },

  balHeader: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  balHdr:    { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  balRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, marginBottom: 4, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  balCode:   { fontSize: 12, fontWeight: '700', color: NAVY },
  balLabelText: { fontSize: 11, color: '#64748B' },
  balAmt:    { fontSize: 11, fontWeight: '600', textAlign: 'right' },
  balTotals: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: NAVY, borderRadius: 10, padding: 12, marginTop: 4 },
  balTotalLabel: { flex: 2, fontSize: 12, fontWeight: '700', color: '#fff' },
  balTotalAmt:   { width: 76, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  glAccount:       { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  glAccountHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: NAVY, padding: 10 },
  glCode:          { fontSize: 12, fontWeight: '700', color: '#fff', width: 48 },
  glAccountLabel:  { flex: 1, fontSize: 12, fontWeight: '600', color: '#CBD5E1' },
  glSolde:         { fontSize: 12, fontWeight: '700' },
  glLine:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  glDate:          { fontSize: 11, color: '#94A3B8', width: 72 },
  glLibelle:       { flex: 1, fontSize: 11, color: '#475569' },
  glAmt:           { fontSize: 11, fontWeight: '600', width: 70, textAlign: 'right' },

  empty:     { alignItems: 'center', paddingVertical: 50 },
  emptyText: { fontSize: 13, color: '#CBD5E1', marginTop: 8, textAlign: 'center' },
});
