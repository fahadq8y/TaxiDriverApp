/**
   * PermissionsHelper.js — v2.7.14
   * 6 permissions, each routed to its specific Settings screen.
   */

  import { PermissionsAndroid, NativeModules, Linking, Platform } from 'react-native';

  const { BatteryOptimization, DeviceAdminModule } = NativeModules;

  // ===== فحص كل صلاحية =====
  export async function checkPermission1_Location() {
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    } catch (e) { return false; }
  }

  export async function checkPermission2_BackgroundLocation() {
    try {
      if (Platform.Version < 29) return true;
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    } catch (e) { return false; }
  }

  export async function checkPermission3_Battery() {
    try {
      if (!BatteryOptimization) return true;
      return await BatteryOptimization.isIgnoringBatteryOptimizations();
    } catch (e) { return false; }
  }

  export async function checkPermission4_Notifications() {
    try {
      if (Platform.Version < 33) return true;
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch (e) { return false; }
  }

  export async function checkPermission5_Overlay() {
    try {
      if (!BatteryOptimization) return true;
      return await BatteryOptimization.canDrawOverlays();
    } catch (e) { return false; }
  }

  export async function checkPermission6_DeviceAdmin() {
    try {
      if (!DeviceAdminModule) return true;
      return await DeviceAdminModule.isAdminActive();
    } catch (e) { return false; }
  }

  // ===== طلب/فتح كل صلاحية =====
  export async function requestPermission1_Location() {
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
    } catch (e) { Linking.openSettings(); }
  }

  export async function requestPermission2_BackgroundLocation() {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED && BatteryOptimization?.openLocationPermissionSettings) {
        BatteryOptimization.openLocationPermissionSettings();
      }
    } catch (e) {
      if (BatteryOptimization?.openLocationPermissionSettings) {
        BatteryOptimization.openLocationPermissionSettings();
      } else { Linking.openSettings(); }
    }
  }

  export function requestPermission3_Battery() {
    try {
      if (BatteryOptimization?.requestIgnoreBatteryOptimizations) {
        BatteryOptimization.requestIgnoreBatteryOptimizations();
      } else { Linking.openSettings(); }
    } catch (e) { Linking.openSettings(); }
  }

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
      } else { Linking.openSettings(); }
    } catch (e) {
      if (BatteryOptimization?.openNotificationSettings) {
        BatteryOptimization.openNotificationSettings();
      } else { Linking.openSettings(); }
    }
  }

  export function requestPermission5_Overlay() {
    try {
      if (BatteryOptimization?.requestOverlayPermission) {
        BatteryOptimization.requestOverlayPermission();
      } else { Linking.openSettings(); }
    } catch (e) { Linking.openSettings(); }
  }

  // صلاحية 6 — Device Admin: يفتح شاشة Android المحددة لتفعيل Device Admin
  export async function requestPermission6_DeviceAdmin() {
    try {
      if (DeviceAdminModule?.requestAdmin) {
        await DeviceAdminModule.requestAdmin();
      } else if (DeviceAdminModule?.openAdminSettings) {
        await DeviceAdminModule.openAdminSettings();
      } else {
        Linking.openSettings();
      }
    } catch (e) {
      if (DeviceAdminModule?.openAdminSettings) {
        try { await DeviceAdminModule.openAdminSettings(); } catch {}
      }
    }
  }

  // ===== فحص الكل دفعة وحدة =====
  export async function checkAllPermissions() {
    const [p1, p2, p3, p4, p5, p6] = await Promise.all([
      checkPermission1_Location(),
      checkPermission2_BackgroundLocation(),
      checkPermission3_Battery(),
      checkPermission4_Notifications(),
      checkPermission5_Overlay(),
      checkPermission6_DeviceAdmin(),
    ]);
    return { p1, p2, p3, p4, p5, p6, allGranted: p1 && p2 && p3 && p4 && p5 && p6 };
  }
  