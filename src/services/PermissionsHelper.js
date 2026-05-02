/**
   * PermissionsHelper.js — v2.7.13
   *
   * كل دالة "request" تفتح الصفحة المحددة لتلك الصلاحية فقط.
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
      if (Platform.Version < 29) return true;
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
      if (Platform.Version < 33) return true;
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

  // صلاحية 1 — Fine Location: dialog النظام مباشرة
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

  // صلاحية 2 — Background Location:
  //   - Android 10: dialog النظام مباشرة (إذا Fine Location مفعّل)
  //   - Android 11+: Google قيّدته → لازم المستخدم يدخل Settings يدوياً.
  //     PermissionsAndroid.request يفتح App Info تلقائياً (Google design).
  export async function requestPermission2_BackgroundLocation() {
    try {
      // محاولة 1: PermissionsAndroid.request — يجرب dialog، إذا فشل يفتح Settings
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
      );
      // إذا ما في dialog (Android 11+) ومستخدم رفض/تجاهل → نفتح App Info صراحة
      if (result !== PermissionsAndroid.RESULTS.GRANTED && BatteryOptimization?.openLocationPermissionSettings) {
        BatteryOptimization.openLocationPermissionSettings();
      }
    } catch (e) {
      if (BatteryOptimization?.openLocationPermissionSettings) {
        BatteryOptimization.openLocationPermissionSettings();
      } else {
        Linking.openSettings();
      }
    }
  }

  // صلاحية 3 — Battery Optimization: dialog النظام مباشرة
  export function requestPermission3_Battery() {
    try {
      if (BatteryOptimization?.requestIgnoreBatteryOptimizations) {
        BatteryOptimization.requestIgnoreBatteryOptimizations();
      } else {
        Linking.openSettings();
      }
    } catch (e) {
      Linking.openSettings();
    }
  }

  // صلاحية 4 — Notifications:
  //   - Android 13+: dialog النظام مباشرة
  //   - Android < 13: يفتح Notification Settings للتطبيق مباشرة (مو App Info)
  export async function requestPermission4_Notifications() {
    try {
      if (Platform.Version >= 33) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED && BatteryOptimization?.openNotificationSettings) {
          BatteryOptimization.openNotificationSettings();
        }
      } else if (BatteryOptimization?.openNotificationSettings) {
        BatteryOptimization.openNotificationSettings();
      } else {
        Linking.openSettings();
      }
    } catch (e) {
      if (BatteryOptimization?.openNotificationSettings) {
        BatteryOptimization.openNotificationSettings();
      } else {
        Linking.openSettings();
      }
    }
  }

  // صلاحية 5 — Display over apps: شاشة Overlay المحددة مباشرة
  export function requestPermission5_Overlay() {
    try {
      if (BatteryOptimization?.requestOverlayPermission) {
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
  