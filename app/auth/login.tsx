import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StyleSheet, ScrollView,
} from 'react-native';
import { router }        from 'expo-router';
import Toast             from 'react-native-toast-message';
import { useAuthStore }  from '../../lib/store';
import { extractApiError } from '../../lib/api/client';

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { login }               = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show({ type: 'error', text1: 'Email et mot de passe requis' });
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)');
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Connexion impossible', text2: extractApiError(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Logo ─────────────────────────────────────── */}
        <View style={styles.logoBox}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>R+</Text>
          </View>
          <Text style={styles.appName}>Vision R+</Text>
          <Text style={styles.tagline}>Comptabilité & Finance Intelligente</Text>
        </View>

        {/* ── Formulaire ────────────────────────────────── */}
        <View style={styles.form}>
          <Text style={styles.title}>Connexion</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="nom@exemple.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Se connecter</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Vision R+ · Comptabilité OHADA & Europe
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logoBox:   { alignItems: 'center', marginBottom: 40 },
  logoIcon:  {
    width: 64, height: 64, borderRadius: 16, backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoText:  { color: '#fff', fontSize: 22, fontWeight: '900' },
  appName:   { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tagline:   { color: '#64748B', fontSize: 12, marginTop: 4 },

  form:      { backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  title:     { fontSize: 20, fontWeight: '700', color: NAVY, marginBottom: 20 },

  fieldGroup: { marginBottom: 16 },
  label:      { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input:      {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    padding: 14, fontSize: 14, color: NAVY, backgroundColor: '#F8FAFC',
  },

  btn:         {
    backgroundColor: ORANGE, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.65 },
  btnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  footer: { color: '#334155', textAlign: 'center', marginTop: 32, fontSize: 11 },
});
