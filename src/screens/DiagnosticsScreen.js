/**
 * DiagnosticsScreen.js — v2.7.19
 * شاشة تشخيص مخفية للمراقب (يفتحها بـ 5 ضغطات على عنوان شاشة الصلاحيات).
 * تعرض:
 *  - حالة الـ 9 صلاحيات + Confidence Score لـ HONOR
 *  - معلومات الجهاز + التتبع
 *  - أسباب قتل التطبيق آخر 24 ساعة (ExitReasons API)
 *  - أزرار حلول مباشرة
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, NativeModules, Linking,
} from 'react-native';
import {
  checkAllPermissions, isHonorOrHuawei,
  requestPermission1_Location, requestPermission2_BackgroundLocation,
  requestPermission3_Battery, requestPermission4_Notifications,
  requestPermission5_Overlay, requestPermission6_DeviceAdmin,
  requestPermission7_HonorProtected, requestPermission8_HonorAutoLaunch,
  requestPermission9_HonorPowerIntensive,
  confirmHonorPermission, getHonorInvalidationReason,
} from '../services/PermissionsHelper';
import { analyzeRecentKills, getPermissionConfidence } from '../services/ExitReasonsHelper';

const { BatteryOptimization } = NativeModules;

const PERM_LABELS = {
  p1: 'الموقع (Fine Location)',
  p2: 'الموقع في الخلفية',
  p3: 'استثناء البطارية',
  p4: 'الإشعارات',
  p5: 'العرض فوق التطبيقات',
  p6: 'مدير الجهاز',
  p7: 'HONOR — التطبيقات المحمية',
  p8: 'HONOR — التشغيل التلقائي',
  p9: 'HONOR — الاستخدام المكثف للبطارية',
};

const PERM_REQUESTERS = {
  p1: requestPermission1_Location,
  p2: requestPermission2_BackgroundLocation,
  p3: requestPermission3_Battery,
  p4: requestPermission4_Notifications,
  p5: requestPermission5_Overlay,
  p6: requestPermission6_DeviceAdmin,
  p7: requestPermission7_HonorProtected,
  p8: requestPermission8_HonorAutoLaunch,
  p9: requestPermission9_HonorPowerIntensive,
};

const HONOR_CONFIRM_KEYS = {
  p7: 'honor_p7_confirmed',
  p8: 'honor_p8_confirmed',
  p9: 'honor_p9_confirmed',
};

export default function DiagnosticsScreen({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState({});
  const [reasons, setReasons] = useState({});
  const [confidences, setConfidences] = useState({});
  const [exitAnalysis, setExitAnalysis] = useState(null);
  const [device, setDevice] = useState({});
  const [employeeNumber, setEmployeeNumber] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;

      // الصلاحيات
      const p = await checkAllPermissions();
      setPerms(p);

      // أسباب الإلغاء
      const r = {};
      if (p.isHonor) {
        r.p7 = await getHonorInvalidationReason('honor_p7_confirmed');
        r.p8 = await getHonorInvalidationReason('honor_p8_confirmed');
        r.p9 = await getHonorInvalidationReason('honor_p9_confirmed');
      }
      setReasons(r);

      // Confidence Score
      const lastLocStr = await AsyncStorage.getItem('last_location_received_at');
      const lastLocAgeMin = lastLocStr ? Math.round((Date.now() - parseInt(lastLocStr)) / 60000) : 999;

      if (p.isHonor) {
        const [c7, c8, c9] = await Promise.all([
          getPermissionConfidence('honor_p7_confirmed', { lastLocAgeMin }),
          getPermissionConfidence('honor_p8_confirmed', { lastLocAgeMin }),
          getPermissionConfidence('honor_p9_confirmed', { lastLocAgeMin }),
        ]);
        setConfidences({ p7: c7, p8: c8, p9: c9 });
      }

      // ExitReasons
      const ex = await analyzeRecentKills(24 * 60 * 60 * 1000);
      setExitAnalysis(ex);

      // الجهاز
      const empNum = await AsyncStorage.getItem('employeeNumber');
      setEmployeeNumber(empNum || '—');
      try {
        const brand = await BatteryOptimization?.getDeviceBrand?.();
        setDevice({ brand: brand || 'unknown', lastLocAgeMin });
      } catch (_) {
        setDevice({ brand: 'unknown', lastLocAgeMin });
      }
    } catch (e) {
      console.warn('[Diagnostics] refresh error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleConfirmHonor = async (permKey) => {
    const storeKey = HONOR_CONFIRM_KEYS[permKey];
    if (!storeKey) return;
    Alert.alert(
      'تأكيد يدوي',
      'هل أنت متأكد إن هذي الصلاحية مفعّلة في إعدادات الجهاز الآن؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'نعم، مفعّلة', onPress: async () => {
          await confirmHonorPermission(storeKey);
          // عدّاد الـ recovery
          try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const cur = parseInt(await AsyncStorage.getItem(storeKey + '_recovered_count') || '0');
            await AsyncStorage.setItem(storeKey + '_recovered_count', String(cur + 1));
          } catch (_) {}
          refresh();
        }},
      ]
    );
  };

  const handleOpenPermission = async (permKey) => {
    const fn = PERM_REQUESTERS[permKey];
    if (fn) await fn();
  };

  const handleResetCounters = async () => {
    Alert.alert('تصفير العدّادات', 'هل تريد تصفير عدّادات إعادة التشغيل والقتل؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', onPress: async () => {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.multiRemove([
            'honor_restart_count_hour', 'honor_restart_count_hour_started',
            'silent_death_count_hour', 'silent_death_count_hour_started',
          ]);
          Alert.alert('تم', 'صُفّرت العدّادات بنجاح');
          refresh();
        } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const handleInvalidateAllHonor = async () => {
    Alert.alert('إلغاء صلاحيات HONOR', 'سيتم إلغاء p7+p8+p9 لطلب إعادة تفعيلها من السائق', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: async () => {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.multiRemove([
            'honor_p7_confirmed', 'honor_p8_confirmed', 'honor_p9_confirmed',
          ]);
          Alert.alert('تم', 'سيُطلب من السائق إعادة تفعيل صلاحيات HONOR');
          refresh();
        } catch (e) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  const handleCycleWakelock = async () => {
    try {
      if (BatteryOptimization?.cycleHonorWakelock) {
        await BatteryOptimization.cycleHonorWakelock();
        Alert.alert('تم', 'cycle wakelock نُفّذ بنجاح');
      } else {
        Alert.alert('غير متوفر', 'الـ wakelock module غير متوفر');
      }
    } catch (e) { Alert.alert('خطأ', e.message); }
  };

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>جاري التحليل...</Text>
      </View>
    );
  }

  const allBasicGranted = perms.p1 && perms.p2 && perms.p3 && perms.p4 && perms.p5 && perms.p6;
  const allHonorGranted = !perms.isHonor || (perms.p7 && perms.p8 && perms.p9);
  const overallStatus = allBasicGranted && allHonorGranted ? 'good' : 'issues';

  const renderPerm = (key) => {
    const granted = perms[key];
    const reason = reasons[key];
    const conf = confidences[key];
    const isHonor = ['p7', 'p8', 'p9'].includes(key);
    return (
      <View key={key} style={styles.permRow}>
        <View style={styles.permHeader}>
          <Text style={styles.permIcon}>{granted ? '✅' : '❌'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.permLabel}>{PERM_LABELS[key]}</Text>
            <Text style={styles.permKey}>{key}</Text>
          </View>
          {!granted && (
            <TouchableOpacity style={styles.smallBtn} onPress={() => handleOpenPermission(key)}>
              <Text style={styles.smallBtnText}>📱 فتح</Text>
            </TouchableOpacity>
          )}
          {isHonor && (
            <TouchableOpacity style={[styles.smallBtn, styles.confirmBtn]} onPress={() => handleConfirmHonor(key)}>
              <Text style={styles.smallBtnText}>✓ مفعّلة</Text>
            </TouchableOpacity>
          )}
        </View>
        {reason && (
          <Text style={styles.reasonLine}>⚠️ سبب الإلغاء: {reason}</Text>
        )}
        {isHonor && conf && (
          <View style={styles.confBar}>
            <Text style={[styles.confLabel, { color: confColor(conf.level) }]}>
              ثقة: {conf.score}% ({confLabel(conf.level)})
            </Text>
            <View style={styles.confTrack}>
              <View style={[styles.confFill, { width: conf.score + '%', backgroundColor: confColor(conf.level) }]} />
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>🔍 تشخيص المراقب</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕ إغلاق</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.statusBox, overallStatus === 'good' ? styles.statusGood : styles.statusBad]}>
        <Text style={styles.statusText}>
          {overallStatus === 'good' ? '🟢 الحالة: ممتازة' : '🔴 الحالة: تحتاج تدخل'}
        </Text>
        <Text style={styles.statusSub}>
          الموظف: {employeeNumber} • الجهاز: {device.brand} • آخر موقع: قبل {device.lastLocAgeMin} د
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔐 الصلاحيات الأساسية (6)</Text>
        {['p1','p2','p3','p4','p5','p6'].map(renderPerm)}
      </View>

      {perms.isHonor && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📱 صلاحيات HONOR (3)</Text>
          {['p7','p8','p9'].map(renderPerm)}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 تحليل قتل التطبيق (آخر 24 ساعة)</Text>
        {exitAnalysis && exitAnalysis.supported ? (
          <>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>قتلات HONOR:</Text>
              <Text style={[styles.statValue, exitAnalysis.honorKills > 0 && styles.statBad]}>
                {exitAnalysis.honorKills}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>قتلات طبيعية:</Text>
              <Text style={styles.statValue}>{exitAnalysis.normalKills}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>درجة شك p7:</Text>
              <Text style={[styles.statValue, exitAnalysis.p7SuspectScore >= 60 && styles.statBad]}>
                {exitAnalysis.p7SuspectScore}%
              </Text>
            </View>
            {exitAnalysis.recent && exitAnalysis.recent.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subTitle}>آخر 5 موتات:</Text>
                {exitAnalysis.recent.slice(0, 5).map((r, i) => (
                  <Text key={i} style={styles.killLine}>
                    • {r.reasonName} — {new Date(r.timestamp).toLocaleString('ar')}
                  </Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.dimText}>⚠️ ExitReasons API غير مدعوم (Android &lt; 11)</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🛠 أوامر التشخيص</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={refresh}>
          <Text style={styles.actionText}>🔄 تحديث الصفحة</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleCycleWakelock}>
          <Text style={styles.actionText}>⚡ Cycle wakelock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleResetCounters}>
          <Text style={styles.actionText}>🧮 صفّر عدّادات HONOR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleInvalidateAllHonor}>
          <Text style={[styles.actionText, { color: '#fff' }]}>♻️ إلغاء صلاحيات HONOR (لإعادة التفعيل)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>v2.7.19 — diagnostics screen</Text>
    </ScrollView>
  );
}

function confColor(level) {
  if (level === 'high') return '#10b981';
  if (level === 'medium') return '#f59e0b';
  if (level === 'low') return '#ef4444';
  return '#7c2d12';
}
function confLabel(level) {
  return { high: 'عالية', medium: 'متوسطة', low: 'منخفضة', critical: 'حرجة', error: 'خطأ', unknown: 'غير معروف' }[level] || level;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingText: { color: '#94a3b8', marginTop: 12 },
  headerBar: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#f1f5f9' },
  closeBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  closeBtnText: { color: '#f1f5f9', fontSize: 13 },
  statusBox: { margin: 12, padding: 14, borderRadius: 10, borderWidth: 1 },
  statusGood: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: '#10b981' },
  statusBad: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' },
  statusText: { fontSize: 16, fontWeight: 'bold', color: '#f1f5f9', textAlign: 'right' },
  statusSub: { fontSize: 12, color: '#cbd5e1', marginTop: 4, textAlign: 'right' },
  card: {
    margin: 12, padding: 14, backgroundColor: '#1e293b',
    borderRadius: 10, borderWidth: 1, borderColor: '#334155',
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#3b82f6', marginBottom: 10, textAlign: 'right' },
  permRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  permHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  permIcon: { fontSize: 18 },
  permLabel: { fontSize: 13, color: '#f1f5f9', textAlign: 'right', fontWeight: '600' },
  permKey: { fontSize: 11, color: '#64748b', textAlign: 'right' },
  smallBtn: { backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginRight: 4 },
  confirmBtn: { backgroundColor: '#065f46' },
  smallBtnText: { color: '#f1f5f9', fontSize: 11, fontWeight: '600' },
  reasonLine: { fontSize: 11, color: '#fbbf24', textAlign: 'right', marginTop: 4, paddingHorizontal: 8 },
  confBar: { marginTop: 6, paddingHorizontal: 8 },
  confLabel: { fontSize: 11, textAlign: 'right', fontWeight: '600' },
  confTrack: { height: 5, backgroundColor: '#334155', borderRadius: 3, marginTop: 3, overflow: 'hidden' },
  confFill: { height: 5, borderRadius: 3 },
  statRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 },
  statLabel: { color: '#94a3b8', fontSize: 13 },
  statValue: { color: '#f1f5f9', fontSize: 13, fontWeight: 'bold' },
  statBad: { color: '#ef4444' },
  subTitle: { fontSize: 12, color: '#cbd5e1', marginBottom: 4, textAlign: 'right', fontWeight: '600' },
  killLine: { fontSize: 11, color: '#94a3b8', textAlign: 'right', paddingVertical: 2 },
  dimText: { color: '#64748b', fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
  actionBtn: {
    backgroundColor: '#0f3460', padding: 12, borderRadius: 8, marginTop: 8,
    borderWidth: 1, borderColor: '#1e40af',
  },
  actionText: { color: '#f1f5f9', textAlign: 'center', fontWeight: '600', fontSize: 13 },
  dangerBtn: { backgroundColor: '#7f1d1d', borderColor: '#dc2626' },
  footer: { textAlign: 'center', color: '#475569', fontSize: 11, marginTop: 12 },
});
