/**
 * PermissionsHelper.js — v2.7.15 (إصلاح B + C)
 * 6 صلاحيات أساسية + 3 صلاحيات HONOR/HUAWEI conditional (تظهر فقط لو الجهاز HONOR)
 */

  import { PermissionsAndroid, NativeModules, Linking, Platform } from 'react-native';

  const { BatteryOptimization, DeviceAdminModule } = NativeModules;

  // ===== v2.7.15: Detect HONOR/HUAWEI device =====
  let _cachedIsHonor = null;
  export async function isHonorOrHuawei() {
    if (_cachedIsHonor !== null) return _cachedIsHonor;
    try {
      if (BatteryOptimization?.getDeviceBrand) {
        const info = await BatteryOptimization.getDeviceBrand(); // "brand|manufacturer|model"
        const lower = (info || '').toLowerCase();
        _cachedIsHonor = lower.includes('honor') || lower.includes('huawei');
      } else {
        _cachedIsHonor = false;
      }
    } catch (e) { _cachedIsHonor = false; }
    return _cachedIsHonor;
  }

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

  // ===== ===== v2.7.15: HONOR-only checks (دائماً false عشان السائق يفتحها يدوياً) =====
  // نخزّن في AsyncStorage لو السائق "أكدها" بنفسه
  export async function checkPermission7_HonorProtected() {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return (await AsyncStorage.getItem('honor_p7_confirmed')) === 'true';
    } catch (e) { return false; }
  }
  export async function checkPermission8_HonorAutoLaunch() {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return (await AsyncStorage.getItem('honor_p8_confirmed')) === 'true';
    } catch (e) { return false; }
  }
  export async function checkPermission9_HonorPowerIntensive() {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      return (await AsyncStorage.getItem('honor_p9_confirmed')) === 'true';
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

  // ===== v2.7.15: HONOR-only requests =====
  export async function requestPermission7_HonorProtected() {
    try {
      if (BatteryOptimization?.openHonorProtectedApps) {
        BatteryOptimization.openHonorProtectedApps();
        // بعد ما يرجع للتطبيق, نفترض أنه فعّلها
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        setTimeout(async () => {
          await AsyncStorage.setItem('honor_p7_confirmed', 'true');
        }, 30000); // بعد 30 ثانية من فتح الإعدادات
      } else { Linking.openSettings(); }
    } catch (e) { Linking.openSettings(); }
  }
  export async function requestPermission8_HonorAutoLaunch() {
    try {
      if (BatteryOptimization?.openHonorAutoLaunch) {
        BatteryOptimization.openHonorAutoLaunch();
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        setTimeout(async () => {
          await AsyncStorage.setItem('honor_p8_confirmed', 'true');
        }, 30000);
      } else { Linking.openSettings(); }
    } catch (e) { Linking.openSettings(); }
  }
  export async function requestPermission9_HonorPowerIntensive() {
    try {
      if (BatteryOptimization?.openHonorPowerIntensive) {
        BatteryOptimization.openHonorPowerIntensive();
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        setTimeout(async () => {
          await AsyncStorage.setItem('honor_p9_confirmed', 'true');
        }, 30000);
      } else { Linking.openSettings(); }
    } catch (e) { Linking.openSettings(); }
  }

  // ===== فحص الكل دفعة وحدة =====
  export async function checkAllPermissions() {
    const isHonor = await isHonorOrHuawei();

    const basicChecks = await Promise.all([
      checkPermission1_Location(),
      checkPermission2_BackgroundLocation(),
      checkPermission3_Battery(),
      checkPermission4_Notifications(),
      checkPermission5_Overlay(),
      checkPermission6_DeviceAdmin(),
    ]);
    const [p1, p2, p3, p4, p5, p6] = basicChecks;
    const basicGranted = p1 && p2 && p3 && p4 && p5 && p6;

    let p7 = true, p8 = true, p9 = true;
    if (isHonor) {
      [p7, p8, p9] = await Promise.all([
        checkPermission7_HonorProtected(),
        checkPermission8_HonorAutoLaunch(),
        checkPermission9_HonorPowerIntensive(),
      ]);
    }
    const allGranted = basicGranted && p7 && p8 && p9;

    return { p1, p2, p3, p4, p5, p6, p7, p8, p9, isHonor, allGranted };
  }

  // helper: confirm HONOR perm manually
  export async function confirmHonorPermission(key) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(key, 'true');
      // v2.7.16: امسح أي علامة invalidation سابقة
      await AsyncStorage.removeItem(key + '_invalidated_reason');
      await AsyncStorage.removeItem(key + '_invalidated_at');
    } catch (e) {}
  }

  // ===== v2.7.16 (إصلاح H): Smart HONOR detection =====
  // يستخدمه HonorHealthMonitor (داخل LocationService) لإلغاء confirmation
  // لما يلاحظ علامات إن السائق ألغى الصلاحية من system manager
  export async function invalidateHonorPermission(key, reason) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const wasConfirmed = (await AsyncStorage.getItem(key)) === 'true';
      if (!wasConfirmed) return false; // ما كانت مفعلة أصلاً
      await AsyncStorage.removeItem(key);
      await AsyncStorage.setItem(key + '_invalidated_reason', String(reason || 'unknown'));
      await AsyncStorage.setItem(key + '_invalidated_at', String(Date.now()));
      console.warn('[HonorHealth] ❌ Invalidated', key, '- reason:', reason);
      return true; // تم الإلغاء
    } catch (e) {
      console.warn('[HonorHealth] invalidate failed:', e.message);
      return false;
    }
  }

  // يقرأ سبب الإلغاء عشان نعرضه للسائق في شاشة الصلاحيات
  export async function getHonorInvalidationReason(key) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const reason = await AsyncStorage.getItem(key + '_invalidated_reason');
      return reason || null;
    } catch (e) { return null; }
  }
