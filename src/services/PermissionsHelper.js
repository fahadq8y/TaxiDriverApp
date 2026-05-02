/**
   * PermissionsHelper.js — v2.7.12
   *
   * أداة فحص وطلب الصلاحيات الـ 5 المطلوبة لتشغيل التطبيق.
   * تستخدم PermissionsAndroid (built-in) + BatteryOptimization Native Module.
   */

  import { PermissionsAndroid, NativeModules, Linking, Platform } from 'react-native';

  const { BatteryOptimization } = NativeModules;

  // ===== فحص كل صلاحية =====
  export async function checkPermission1_Location() {
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    } catch (e) {
      return false;
    }
  }

  export async function checkPermission2_BackgroundLocation() {
    try {
      if (Platform.Version < 29) return true; // Android < 10 لا يحتاج background permission منفصل
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    } catch (e) {
      return false;
    }
  }

  export async function checkPermission3_Battery() {
    try {
      if (!BatteryOptimization) return true;
      return await BatteryOptimization.isIgnoringBatteryOptimizations();
    } catch (e) {
      return false;
    }
  }

  export async function checkPermission4_Notifications() {
    try {
      if (Platform.Version < 33) return true; // Android < 13 لا يحتاج runtime permission للإشعارات
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch (e) {
      return false;
    }
  }

  export async function checkPermission5_Overlay() {
    try {
      if (!BatteryOptimization) return true;
      return await BatteryOptimization.canDrawOverlays();
    } catch (e) {
      return false;
    }
  }

  // ===== طلب/فتح كل صلاحية =====
  export async function requestPermission1_Location() {
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
    } catch (e) {
      Linking.openSettings();
    }
  }

  export async function requestPermission2_BackgroundLocation() {
    try {
      if (Platform.Version >= 30) {
        // Android 11+: لازم يدخل الإعدادات يدوياً ويختار "السماح طول الوقت"
        Linking.openSettings();
      } else {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
        );
      }
    } catch (e) {
      Linking.openSettings();
    }
  }

  export function requestPermission3_Battery() {
    try {
      if (BatteryOptimization && BatteryOptimization.requestIgnoreBatteryOptimizations) {
        BatteryOptimization.requestIgnoreBatteryOptimizations();
      } else {
        Linking.openSettings();
      }
    } catch (e) {
      Linking.openSettings();
    }
  }

  export async function requestPermission4_Notifications() {
    try {
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      } else {
        Linking.openSettings();
      }
    } catch (e) {
      Linking.openSettings();
    }
  }

  export function requestPermission5_Overlay() {
    try {
      if (BatteryOptimization && BatteryOptimization.requestOverlayPermission) {
        BatteryOptimization.requestOverlayPermission();
      } else {
        Linking.openSettings();
      }
    } catch (e) {
      Linking.openSettings();
    }
  }

  // ===== فحص الكل دفعة وحدة =====
  export async function checkAllPermissions() {
    const [p1, p2, p3, p4, p5] = await Promise.all([
      checkPermission1_Location(),
      checkPermission2_BackgroundLocation(),
      checkPermission3_Battery(),
      checkPermission4_Notifications(),
      checkPermission5_Overlay(),
    ]);
    return { p1, p2, p3, p4, p5, allGranted: p1 && p2 && p3 && p4 && p5 };
  }
  