/**
 * PermissionGate.js — v2.7.19 (5 ضغطات → DiagnosticsScreen + زر "أنا فعّلتها يدوياً")
 * 6 صلاحيات أساسية + 3 صلاحيات HONOR conditional + Smart Detection
 */

  import React, { useEffect, useState, useRef, useCallback } from 'react';
  import {
    View, Text, TouchableOpacity, StyleSheet, BackHandler,
    AppState, Alert, ActivityIndicator, ScrollView,
  } from 'react-native';
  import {
    checkAllPermissions,
    requestPermission1_Location,
    requestPermission2_BackgroundLocation,
    requestPermission3_Battery,
    requestPermission4_Notifications,
    requestPermission5_Overlay,
    requestPermission6_DeviceAdmin,
    requestPermission7_HonorProtected,
    requestPermission8_HonorAutoLaunch,
    requestPermission9_HonorPowerIntensive,
    confirmHonorPermission,
    getHonorInvalidationReason,
  } from '../services/PermissionsHelper';
  import DiagnosticsScreen from './DiagnosticsScreen';

  const POLL_INTERVAL_MS = 2000;

  export default function PermissionGate({ children }) {
    const [state, setState] = useState({
      p1: false, p2: false, p3: false, p4: false, p5: false, p6: false,
      p7: true, p8: true, p9: true, isHonor: false, allGranted: false,
    });
    const [reasons, setReasons] = useState({}); // v2.7.16: invalidation reasons
    const [loading, setLoading] = useState(true);
    const [showDiagnostics, setShowDiagnostics] = useState(false); // v2.7.19: شاشة المراقب
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef(null);
    const intervalRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);

    // v2.7.19: ٥ ضغطات على العنوان → DiagnosticsScreen (للمراقب فقط)
    const handleTitleTap = useCallback(() => {
      tapCountRef.current += 1;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 3000);
      if (tapCountRef.current >= 5) {
        tapCountRef.current = 0;
        setShowDiagnostics(true);
      }
    }, []);

    const refresh = useCallback(async () => {
      const result = await checkAllPermissions();
      setState(result);

      // v2.7.16: اقرأ أسباب الإلغاء التلقائي للصلاحيات HONOR
      if (result.isHonor) {
        const r = {};
        if (!result.p7) r.p7 = await getHonorInvalidationReason('honor_p7_confirmed');
        if (!result.p8) r.p8 = await getHonorInvalidationReason('honor_p8_confirmed');
        if (!result.p9) r.p9 = await getHonorInvalidationReason('honor_p9_confirmed');
        setReasons(r);
      }

      if (loading) setLoading(false);
      return result;
    }, [loading]);

    useEffect(() => {
      refresh();
      intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [refresh]);

    useEffect(() => {
      const sub = AppState.addEventListener('change', (next) => {
        if (appStateRef.current.match(/inactive|background/) && next === 'active') {
          refresh();
        }
        appStateRef.current = next;
      });
      return () => sub.remove();
    }, [refresh]);

    useEffect(() => {
      if (state.allGranted) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert(
          'تنبيه',
          'بدون تفعيل جميع الصلاحيات لا يعمل التطبيق.',
          [
            { text: 'متابعة', style: 'cancel' },
            { text: 'خروج', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: false }
        );
        return true;
      });
      return () => sub.remove();
    }, [state.allGranted]);

    // v2.7.19: شاشة التشخيص للمراقب
    if (showDiagnostics) {
      return <DiagnosticsScreen onClose={() => { setShowDiagnostics(false); refresh(); }} />;
    }

    if (state.allGranted) return children;

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFC107" />
        </View>
      );
    }

    // helper: زر "أكدت" — لو السائق فتح الإعدادات وضغط بنفسه
    const handleHonorAction = (requestFn, confirmKey) => {
      requestFn();
      setTimeout(() => {
        Alert.alert(
          'تأكيد',
          'هل قمت بتفعيل الإعداد؟',
          [
            { text: 'لا', style: 'cancel' },
            { text: 'نعم، فعّلته', onPress: async () => {
              await confirmHonorPermission(confirmKey);
              refresh();
            }},
          ]
        );
      }, 5000);
    };

    const items = [
      { key: 'p1', label: 'صلاحية 1', granted: state.p1, onPress: requestPermission1_Location },
      { key: 'p2', label: 'صلاحية 2', granted: state.p2, onPress: requestPermission2_BackgroundLocation },
      { key: 'p3', label: 'صلاحية 3', granted: state.p3, onPress: requestPermission3_Battery },
      { key: 'p4', label: 'صلاحية 4', granted: state.p4, onPress: requestPermission4_Notifications },
      { key: 'p5', label: 'صلاحية 5', granted: state.p5, onPress: requestPermission5_Overlay },
      { key: 'p6', label: 'صلاحية 6', granted: state.p6, onPress: requestPermission6_DeviceAdmin },
    ];

    if (state.isHonor) {
      items.push(
        { key: 'p7', label: 'صلاحية 7', granted: state.p7, reason: reasons.p7,
          onPress: () => handleHonorAction(requestPermission7_HonorProtected, 'honor_p7_confirmed') },
        { key: 'p8', label: 'صلاحية 8', granted: state.p8, reason: reasons.p8,
          onPress: () => handleHonorAction(requestPermission8_HonorAutoLaunch, 'honor_p8_confirmed') },
        { key: 'p9', label: 'صلاحية 9', granted: state.p9, reason: reasons.p9,
          onPress: () => handleHonorAction(requestPermission9_HonorPowerIntensive, 'honor_p9_confirmed') },
      );
    }

    // v2.7.16: هل أي صلاحية HONOR انغلقت تلقائياً؟ نعرض رسالة تنبيه
    const autoDetected = state.isHonor && (reasons.p7 || reasons.p8 || reasons.p9);

    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.container}>
          <TouchableOpacity activeOpacity={1} onPress={handleTitleTap}>
            <Text style={styles.title}>لتشغيل التطبيق</Text>
          </TouchableOpacity>
          <Text style={styles.subtitle}>فعّل الصلاحيات التالية:</Text>

          {autoDetected && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ التطبيق اكتشف إن واحدة من الصلاحيات انغلقت من إعدادات النظام. الرجاء تفعيلها مرة ثانية.
              </Text>
            </View>
          )}

          <View style={styles.list}>
            {items.map((item) => (
              <View key={item.key}>
                <View style={styles.row}>
                  <Text style={styles.statusIcon}>{item.granted ? '✅' : '❌'}</Text>
                  <Text style={styles.label}>{item.label}</Text>
                  {item.granted ? (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneText}>تم</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => item.onPress()}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.actionText}>تفعيل</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {item.reason && !item.granted && (
                  <Text style={styles.reasonText}>
                    🔍 اكتشف التطبيق إنها انغلقت — يحتاج تفعيلها مرة ثانية
                  </Text>
                )}
                {/* v2.7.19: زر "أنا فعّلتها يدوياً" لصلاحيات HONOR فقط */}
                {!item.granted && ['p7','p8','p9'].includes(item.key) && (
                  <TouchableOpacity
                    style={styles.manualConfirmBtn}
                    onPress={async () => {
                      const key = item.key === 'p7' ? 'honor_p7_confirmed'
                                : item.key === 'p8' ? 'honor_p8_confirmed'
                                : 'honor_p9_confirmed';
                      Alert.alert('تأكيد', 'هل أنت متأكد إنك فعّلت هذي الصلاحية في إعدادات الجهاز؟', [
                        { text: 'لا', style: 'cancel' },
                        { text: 'نعم', onPress: async () => {
                          await confirmHonorPermission(key);
                          refresh();
                        }},
                      ]);
                    }}
                  >
                    <Text style={styles.manualConfirmText}>✓ أنا فعّلتها يدوياً</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    scroll: { flexGrow: 1, backgroundColor: '#fff' },
    container: { flex: 1, padding: 24, justifyContent: 'center', minHeight: '100%' },
    title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#222', marginBottom: 8 },
    subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 16 },
    warningBox: { backgroundColor: '#fff3cd', borderRightWidth: 4, borderRightColor: '#ffc107',
      borderRadius: 8, padding: 12, marginBottom: 16 },
    warningText: { fontSize: 14, color: '#856404', textAlign: 'right', lineHeight: 20 },
    list: { backgroundColor: '#fafafa', borderRadius: 12, padding: 8 },
    row: {
      flexDirection: 'row-reverse', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 12,
      borderBottomWidth: 1, borderBottomColor: '#eee',
    },
    statusIcon: { fontSize: 20, marginLeft: 12 },
    label: { flex: 1, fontSize: 18, color: '#333', textAlign: 'right' },
    actionBtn: { backgroundColor: '#FFC107', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
    actionText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
    doneBadge: { backgroundColor: '#e8f5e9', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
    doneText: { color: '#2e7d32', fontSize: 15, fontWeight: 'bold' },
    reasonText: { fontSize: 12, color: '#d32f2f', textAlign: 'right',
      paddingHorizontal: 12, paddingBottom: 8, fontStyle: 'italic' },
    manualConfirmBtn: {
      marginHorizontal: 12, marginBottom: 8, paddingVertical: 8,
      backgroundColor: '#e8f5e9', borderRadius: 6,
      borderWidth: 1, borderColor: '#a5d6a7',
    },
    manualConfirmText: {
      textAlign: 'center', color: '#2e7d32', fontSize: 13, fontWeight: '600',
    },
  });
