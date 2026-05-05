import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { documentsApi, isOnline } from '../../lib/api/client';
import { useCompanyStore } from '../../lib/store';
import { enqueueSync } from '../../lib/db/offline';

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

type ScanState = 'idle' | 'camera' | 'preview' | 'uploading' | 'done';

export default function ScanScreen() {
  const { activeCompany } = useCompanyStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [state, setState]       = useState<ScanState>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [docType, setDocType]   = useState('INVOICE');

  const DOC_TYPES = [
    { value: 'INVOICE',  label: 'Facture' },
    { value: 'RECEIPT',  label: 'Reçu' },
    { value: 'BANK_STATEMENT', label: 'Relevé bancaire' },
    { value: 'CONTRACT', label: 'Contrat' },
    { value: 'OTHER',    label: 'Autre' },
  ];

  const openCamera = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permission refusée', 'L\'accès à la caméra est requis pour scanner des documents.');
        return;
      }
    }
    setState('camera');
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
      setState('preview');
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setImageUri(photo.uri);
      setState('preview');
    } catch {
      Alert.alert('Erreur', 'Impossible de prendre la photo');
    }
  };

  const upload = async () => {
    if (!imageUri || !activeCompany) return;
    setState('uploading');

    const connected = await isOnline();

    try {
      if (connected) {
        const filename = `scan_${Date.now()}.jpg`;
        const result = await documentsApi.upload(activeCompany.id, {
          uri: imageUri,
          type: 'image/jpeg',
          name: filename,
          doc_type: docType,
        });
        setOcrResult(result.ocr_data ?? null);
        setState('done');
      } else {
        await enqueueSync('CREATE', 'documents', {
          company_id: activeCompany.id,
          doc_type: docType,
          source: 'MOBILE_SCAN',
          original_filename: `scan_${Date.now()}.jpg`,
          pending_upload: true,
        });
        Alert.alert(
          'Hors ligne',
          'Le document sera synchronisé lors de la prochaine connexion.',
          [{ text: 'OK', onPress: () => reset() }]
        );
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Upload échoué');
      setState('preview');
    }
  };

  const reset = () => {
    setImageUri(null);
    setOcrResult(null);
    setState('idle');
  };

  /* ── Camera view ──────────────────────────────────── */
  if (state === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          <View style={styles.cameraOverlay}>
            <View style={styles.scanFrame} />
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity onPress={() => setState('idle')} style={styles.camBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={takePicture} style={styles.captureBtn}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickFromGallery} style={styles.camBtn}>
              <Ionicons name="images-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  /* ── Preview / upload ─────────────────────────────── */
  if (state === 'preview' || state === 'uploading') {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setState('idle')}>
            <Ionicons name="arrow-back" size={22} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Vérification</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Image source={{ uri: imageUri! }} style={styles.preview} resizeMode="contain" />

          <Text style={styles.sectionLabel}>Type de document</Text>
          <View style={styles.typeGrid}>
            {DOC_TYPES.map(t => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeChip, docType === t.value && styles.typeChipActive]}
                onPress={() => setDocType(t.value)}
              >
                <Text style={[styles.typeChipText, docType === t.value && styles.typeChipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.uploadBtn, state === 'uploading' && { opacity: 0.6 }]}
            onPress={upload}
            disabled={state === 'uploading'}
          >
            {state === 'uploading'
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={styles.uploadTxt}>Envoyer et analyser</Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.retakeBtn} onPress={() => setState('camera')}>
            <Ionicons name="camera-outline" size={16} color="#64748B" />
            <Text style={styles.retakeTxt}>Reprendre la photo</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  /* ── Done / OCR result ───────────────────────────── */
  if (state === 'done') {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={reset}>
            <Ionicons name="close" size={22} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Résultat OCR</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#059669" />
            <Text style={styles.successTxt}>Document enregistré avec succès</Text>
          </View>

          {ocrResult && (
            <>
              <Text style={styles.sectionLabel}>Données extraites</Text>
              <View style={styles.ocrCard}>
                {ocrResult.vendor_name && <OcrRow label="Fournisseur" value={ocrResult.vendor_name} />}
                {ocrResult.invoice_date && <OcrRow label="Date" value={ocrResult.invoice_date} />}
                {ocrResult.total_amount !== undefined && (
                  <OcrRow
                    label="Montant"
                    value={`${ocrResult.total_amount} ${ocrResult.currency ?? ''}`}
                  />
                )}
                {ocrResult.tax_amount !== undefined && (
                  <OcrRow label="TVA" value={String(ocrResult.tax_amount)} />
                )}
                {ocrResult.invoice_number && <OcrRow label="N° facture" value={ocrResult.invoice_number} />}
                <View style={styles.confidenceRow}>
                  <Text style={styles.ocrLabel}>Confiance OCR</Text>
                  <View style={styles.confidenceBar}>
                    <View style={[styles.confidenceFill, { width: `${(ocrResult.confidence ?? 0) * 100}%` as any }]} />
                  </View>
                  <Text style={styles.confidencePct}>{Math.round((ocrResult.confidence ?? 0) * 100)}%</Text>
                </View>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.uploadBtn} onPress={reset}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.uploadTxt}>Scanner un autre document</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  /* ── Idle ─────────────────────────────────────────── */
  return (
    <View style={styles.idleContainer}>
      <View style={styles.iconWrap}>
        <Ionicons name="scan-outline" size={48} color={ORANGE} />
      </View>
      <Text style={styles.idleTitle}>Scanner un document</Text>
      <Text style={styles.idleSub}>Factures, reçus, relevés bancaires — analysés automatiquement par OCR</Text>

      <TouchableOpacity style={styles.primaryBtn} onPress={openCamera}>
        <Ionicons name="camera-outline" size={20} color="#fff" />
        <Text style={styles.primaryTxt}>Utiliser la caméra</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={pickFromGallery}>
        <Ionicons name="images-outline" size={20} color={NAVY} />
        <Text style={styles.secondaryTxt}>Choisir depuis la galerie</Text>
      </TouchableOpacity>

      <View style={styles.tipBox}>
        <Ionicons name="information-circle-outline" size={16} color="#3B82F6" />
        <Text style={styles.tipText}>Pour de meilleurs résultats, assurez-vous que le document est bien éclairé et lisible.</Text>
      </View>
    </View>
  );
}

const OcrRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.ocrRow}>
    <Text style={styles.ocrLabel}>{label}</Text>
    <Text style={styles.ocrValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  topBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  topTitle:{ fontSize: 17, fontWeight: '700', color: NAVY },

  cameraOverlay:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame:      { width: 260, height: 340, borderWidth: 2, borderColor: ORANGE, borderRadius: 12, opacity: 0.8 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 40, paddingTop: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  camBtn:         { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  captureBtn:     { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  captureInner:   { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },

  preview:      { width: '100%', height: 300, borderRadius: 14, marginBottom: 16, backgroundColor: '#E2E8F0' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  typeGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  typeChip:     { borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  typeChipActive: { borderColor: ORANGE, backgroundColor: '#FFF7ED' },
  typeChipText:   { fontSize: 13, color: '#64748B', fontWeight: '500' },
  typeChipTextActive: { color: ORANGE, fontWeight: '700' },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ORANGE, borderRadius: 14, padding: 16, marginBottom: 10 },
  uploadTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
  retakeTxt: { color: '#64748B', fontSize: 14 },

  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, marginBottom: 16 },
  successTxt:    { fontSize: 14, fontWeight: '600', color: '#059669' },

  ocrCard:  { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16 },
  ocrRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  ocrLabel: { fontSize: 12, color: '#64748B' },
  ocrValue: { fontSize: 13, fontWeight: '600', color: NAVY },

  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  confidenceBar: { flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  confidenceFill:{ height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
  confidencePct: { fontSize: 12, fontWeight: '600', color: '#10B981', width: 32, textAlign: 'right' },

  idleContainer: { flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap:      { width: 88, height: 88, borderRadius: 24, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  idleTitle:     { fontSize: 20, fontWeight: '800', color: NAVY, marginBottom: 8, textAlign: 'center' },
  idleSub:       { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 32 },

  primaryBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12, width: '100%', justifyContent: 'center' },
  primaryTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 24, width: '100%', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
  secondaryTxt: { color: NAVY, fontSize: 15, fontWeight: '600' },

  tipBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12 },
  tipText: { flex: 1, fontSize: 12, color: '#3B82F6', lineHeight: 18 },
});
