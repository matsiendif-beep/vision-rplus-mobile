import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Switch, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore, useCompanyStore, useSyncStore } from '../../lib/store';
import { performSync } from '../../lib/db/offline';
import { isOnline } from '../../lib/api/client';

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

export default function SettingsScreen() {
  const { user, logout }                              = useAuthStore();
  const { companies, activeCompany, activeFiscalYear,
          setActiveCompany, fiscalYears, setActiveFiscalYear } = useCompanyStore();
  const { isSyncing, setIsSyncing, lastSyncAt, setLastSyncAt } = useSyncStore();

  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [showFyPicker, setShowFyPicker]           = useState(false);
  const [notifications, setNotifications]         = useState(true);
  const [darkMode, setDarkMode]                   = useState(false);

  const fmtDate = (iso: string | null) => {
    if (!iso) return 'Jamais';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSync = async () => {
    if (!activeCompany || isSyncing) return;
    const connected = await isOnline();
    if (!connected) { Alert.alert('Hors ligne', 'Impossible de synchroniser sans connexion.'); return; }
    setIsSyncing(true);
    try {
      await performSync(activeCompany.id);
      setLastSyncAt(new Date().toISOString());
      Alert.alert('Synchronisation', 'Données synchronisées avec succès.');
    } catch {
      Alert.alert('Erreur', 'La synchronisation a échoué.');
    } finally { setIsSyncing(false); }
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vraiment vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnecter', style: 'destructive', onPress: async () => {
            await logout();
            router.replace('/auth/login');
          }
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Profil ─────────────────────────────────── */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.first_name?.[0] ?? ''}{user?.last_name?.[0] ?? ''}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{user?.first_name} {user?.last_name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>
      </View>

      {/* ── Entreprise ─────────────────────────────── */}
      <Section title="Entreprise">
        <SettingRow
          icon="business-outline"
          label="Entreprise active"
          value={activeCompany?.name ?? 'Aucune'}
          onPress={() => setShowCompanyPicker(true)}
          chevron
        />
        <SettingRow
          icon="calendar-outline"
          label="Exercice fiscal"
          value={activeFiscalYear?.label ?? '—'}
          onPress={() => setShowFyPicker(true)}
          chevron
        />
      </Section>

      {/* ── Synchronisation ────────────────────────── */}
      <Section title="Synchronisation">
        <View style={styles.syncStatus}>
          <View style={styles.settingRow}>
            <View style={[styles.iconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="cloud-outline" size={18} color="#3B82F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Dernière sync</Text>
              <Text style={styles.rowSub}>{fmtDate(lastSyncAt)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={isSyncing}>
          {isSyncing
            ? <ActivityIndicator size="small" color={ORANGE} />
            : <Ionicons name="sync-outline" size={16} color={ORANGE} />
          }
          <Text style={styles.syncTxt}>{isSyncing ? 'Synchronisation…' : 'Synchroniser maintenant'}</Text>
        </TouchableOpacity>
      </Section>

      {/* ── Préférences ────────────────────────────── */}
      <Section title="Préférences">
        <View style={styles.settingRow}>
          <View style={[styles.iconWrap, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="notifications-outline" size={18} color={ORANGE} />
          </View>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#E2E8F0', true: ORANGE }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <View style={[styles.iconWrap, { backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="moon-outline" size={18} color="#64748B" />
          </View>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Mode sombre</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: '#E2E8F0', true: NAVY }}
            thumbColor="#fff"
          />
        </View>
      </Section>

      {/* ── À propos ───────────────────────────────── */}
      <Section title="À propos">
        <SettingRow icon="information-circle-outline" label="Version" value="1.0.0" iconBg="#EFF6FF" iconColor="#3B82F6" />
        <SettingRow icon="shield-checkmark-outline" label="Politique de confidentialité" chevron iconBg="#ECFDF5" iconColor="#10B981" />
        <SettingRow icon="document-text-outline" label="Conditions d'utilisation" chevron last iconBg="#F5F3FF" iconColor="#8B5CF6" />
      </Section>

      {/* ── Déconnexion ────────────────────────────── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={styles.logoutTxt}>Se déconnecter</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Vision R+ · Comptabilité OHADA & Europe</Text>

      {/* ── Company Picker ────────────────────────── */}
      {showCompanyPicker && (
        <PickerModal
          title="Choisir une entreprise"
          items={companies.map(c => ({ id: c.id, label: c.name }))}
          activeId={activeCompany?.id}
          onSelect={id => {
            const c = companies.find(x => x.id === id);
            if (c) setActiveCompany(c);
            setShowCompanyPicker(false);
          }}
          onClose={() => setShowCompanyPicker(false)}
        />
      )}

      {/* ── FY Picker ─────────────────────────────── */}
      {showFyPicker && (
        <PickerModal
          title="Choisir un exercice"
          items={fiscalYears.map(f => ({ id: f.id, label: f.label + (f.is_closed ? ' (clôturé)' : '') }))}
          activeId={activeFiscalYear?.id}
          onSelect={id => {
            const f = fiscalYears.find(x => x.id === id);
            if (f) setActiveFiscalYear(f);
            setShowFyPicker(false);
          }}
          onClose={() => setShowFyPicker(false)}
        />
      )}
    </ScrollView>
  );
}

/* ── Sub-components ───────────────────────────────────── */

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

const SettingRow = ({
  icon, label, value, onPress, chevron, last = false,
  iconBg = '#FFF7ED', iconColor = ORANGE,
}: {
  icon: any; label: string; value?: string;
  onPress?: () => void; chevron?: boolean; last?: boolean;
  iconBg?: string; iconColor?: string;
}) => (
  <TouchableOpacity
    style={[styles.settingRow, last && { borderBottomWidth: 0 }]}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
    {value && <Text style={styles.rowValue}>{value}</Text>}
    {chevron && <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 4 }} />}
  </TouchableOpacity>
);

const PickerModal = ({
  title, items, activeId, onSelect, onClose,
}: {
  title: string; items: { id: string; label: string }[];
  activeId?: string; onSelect: (id: string) => void; onClose: () => void;
}) => (
  <View style={styles.pickerOverlay}>
    <View style={styles.pickerCard}>
      <View style={styles.pickerHeader}>
        <Text style={styles.pickerTitle}>{title}</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={20} color={NAVY} />
        </TouchableOpacity>
      </View>
      <ScrollView>
        {items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.pickerItem}
            onPress={() => onSelect(item.id)}
          >
            <Text style={[styles.pickerItemText, item.id === activeId && { color: ORANGE, fontWeight: '700' }]}>
              {item.label}
            </Text>
            {item.id === activeId && <Ionicons name="checkmark" size={16} color={ORANGE} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content:   { padding: 16, paddingBottom: 40 },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  avatar:      { width: 52, height: 52, borderRadius: 16, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#fff', fontSize: 18, fontWeight: '800' },
  profileName: { fontSize: 15, fontWeight: '700', color: NAVY },
  profileEmail:{ fontSize: 12, color: '#94A3B8', marginTop: 2 },

  section:      { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 2 },
  sectionCard:  { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  iconWrap:   { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: 14, color: NAVY },
  rowSub:     { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  rowValue:   { fontSize: 13, color: '#94A3B8' },

  syncStatus: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  syncBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, justifyContent: 'center' },
  syncTxt:    { fontSize: 14, fontWeight: '600', color: ORANGE },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginTop: 4 },
  logoutTxt: { fontSize: 14, fontWeight: '700', color: '#DC2626' },

  footer: { textAlign: 'center', color: '#CBD5E1', fontSize: 11, marginTop: 24 },

  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' },
  pickerHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pickerTitle:   { fontSize: 16, fontWeight: '700', color: NAVY },
  pickerItem:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  pickerItemText:{ fontSize: 14, color: '#475569' },
});
