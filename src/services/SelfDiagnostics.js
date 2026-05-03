/**
 * SelfDiagnostics.js — v2.7.17
 * نظام تشخيص ذاتي للبرنامج:
 *   - يكتب snapshot شامل كل 5 دقائق في driverDiagnostics/{driverId}
 *   - يستمع لأوامر remote من driverDiagnostics/{driverId}/commands
 *   - يلتقط الأخطاء العالمية ويحفظها
 *
 * الإدارة (المدير) يقدر يطلب من webpage:
 *   - snapshot فوري
 *   - hardRestart للـ RNBG
 *   - cycle wakelock
 *   - getCurrentPosition
 *   - مسح صلاحيات HONOR وإعادة الإجبار
 */

import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { Platform, NativeModules } from 'react-native';
import DeviceInfo from 'react-native-device-info';

const APP_VERSION = require('../../package.json').version;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 دقائق

class SelfDiagnostics {
  constructor() {
    this.driverId = null;
    this.snapshotInterval = null;
    this.commandUnsub = null;
    this.errorLog = []; // آخر 30 خطأ
    this.started = false;
  }

  async start(driverId) {
    if (!driverId) return;
    if (this.started && this.driverId === driverId) return;

    this.driverId = driverId;
    this.started = true;

    // 1) snapshot دوري
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.collectAndPushSnapshot().catch(e => console.warn('[SelfDiag] init snapshot:', e.message));
    this.snapshotInterval = setInterval(() => {
      this.collectAndPushSnapshot().catch(e => console.warn('[SelfDiag] periodic:', e.message));
    }, SNAPSHOT_INTERVAL_MS);

    // 2) listen for remote commands
    this.listenForCommands();

    // 3) catch global errors
    this.attachErrorHandler();

    console.log('[SelfDiag] 🔬 Self-diagnostics started for', driverId);
  }

  stop() {
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    if (this.commandUnsub) this.commandUnsub();
    this.snapshotInterval = null;
    this.commandUnsub = null;
    this.started = false;
  }

  async collectAndPushSnapshot() {
    if (!this.driverId) return;
    const snap = await this.buildSnapshot();
    try {
      await firestore().collection('driverDiagnostics').doc(this.driverId).set(snap, { merge: false });
      console.log('[SelfDiag] ✅ Snapshot pushed (lastLoc age:', snap.lastLocationAgeMin, 'min)');
    } catch (e) {
      console.warn('[SelfDiag] write err:', e.message);
    }
  }

  async buildSnapshot() {
    const now = Date.now();
    const snap = {
      driverId: this.driverId,
      collectedAt: firestore.FieldValue.serverTimestamp(),
      collectedAtMs: now,
      appVersion: APP_VERSION,
      platform: Platform.OS,
      platformVersion: String(Platform.Version),
    };

    // Device info
    try {
      snap.device = {
        brand: await DeviceInfo.getBrand(),
        manufacturer: await DeviceInfo.getManufacturer(),
        model: DeviceInfo.getModel(),
        systemName: DeviceInfo.getSystemName(),
        systemVersion: DeviceInfo.getSystemVersion(),
        battery: await DeviceInfo.getBatteryLevel(),
        isPowerSaveMode: await DeviceInfo.isPowerSaveMode(),
      };
    } catch (e) { snap.device = { error: e.message }; }

    // RNBG state
    try {
      const state = await BackgroundGeolocation.getState();
      snap.rnbg = {
        enabled: state.enabled,
        isMoving: state.isMoving,
        trackingMode: state.trackingMode,
        odometer: state.odometer,
        schedulerEnabled: state.schedulerEnabled,
        distanceFilter: state.distanceFilter,
        desiredAccuracy: state.desiredAccuracy,
        stopOnTerminate: state.stopOnTerminate,
        startOnBoot: state.startOnBoot,
      };
      const count = await BackgroundGeolocation.getCount();
      snap.rnbg.queueCount = count;
    } catch (e) { snap.rnbg = { error: e.message }; }

    // Last location received (مفتاح اكتشاف Silent Death)
    try {
      const lastLoc = parseInt((await AsyncStorage.getItem('last_location_received_at')) || '0', 10);
      snap.lastLocationReceivedAt = lastLoc || null;
      snap.lastLocationAgeMin = lastLoc ? Math.floor((now - lastLoc) / 60000) : null;
    } catch (e) {}

    // Last bg-fetch
    try {
      const lastBg = parseInt((await AsyncStorage.getItem('last_bg_fetch_at')) || '0', 10);
      snap.lastBgFetchAt = lastBg || null;
      snap.lastBgFetchAgeMin = lastBg ? Math.floor((now - lastBg) / 60000) : null;
    } catch (e) {}

    // Last wakelock cycle
    try {
      const lastCycle = parseInt((await AsyncStorage.getItem('last_wakelock_cycle_at')) || '0', 10);
      snap.lastWakelockCycleAt = lastCycle || null;
      snap.lastWakelockCycleAgeMin = lastCycle ? Math.floor((now - lastCycle) / 60000) : null;
    } catch (e) {}

    // Permissions (real check)
    try {
      const { checkAllPermissions } = require('./PermissionsHelper');
      const perms = await checkAllPermissions();
      snap.permissions = perms;
    } catch (e) { snap.permissions = { error: e.message }; }

    // HONOR-specific stats
    try {
      const restartCount = parseInt((await AsyncStorage.getItem('honor_restart_count_hour')) || '0', 10);
      const silentDeathCount = parseInt((await AsyncStorage.getItem('silent_death_count_hour')) || '0', 10);
      const lastAlive = parseInt((await AsyncStorage.getItem('honor_last_alive_ping')) || '0', 10);
      snap.honorStats = {
        restartCountHour: restartCount,
        silentDeathCountHour: silentDeathCount,
        lastAlivePingAgeMin: lastAlive ? Math.floor((now - lastAlive) / 60000) : null,
        p7_confirmed: (await AsyncStorage.getItem('honor_p7_confirmed')) === 'true',
        p8_confirmed: (await AsyncStorage.getItem('honor_p8_confirmed')) === 'true',
        p9_confirmed: (await AsyncStorage.getItem('honor_p9_confirmed')) === 'true',
        p7_invalidated: await AsyncStorage.getItem('honor_p7_confirmed_invalidated_reason'),
        p8_invalidated: await AsyncStorage.getItem('honor_p8_confirmed_invalidated_reason'),
        p9_invalidated: await AsyncStorage.getItem('honor_p9_confirmed_invalidated_reason'),
      };
    } catch (e) {}

    // Memory (best effort)
    try {
      const mem = await DeviceInfo.getUsedMemory();
      snap.memoryUsedMB = Math.round(mem / 1024 / 1024);
    } catch (e) {}

    // Recent errors
    snap.recentErrors = this.errorLog.slice(-20);

    // Computed health verdict
    snap.healthVerdict = this.computeHealthVerdict(snap);

    return snap;
  }

  // تحليل ذكي يلخّص حالة التطبيق
  computeHealthVerdict(snap) {
    const issues = [];
    if (snap.rnbg?.enabled === false) issues.push('RNBG_DISABLED');
    if (snap.lastLocationAgeMin != null && snap.lastLocationAgeMin > 15) {
      issues.push(`SILENT_DEATH_${snap.lastLocationAgeMin}min`);
    }
    if (snap.lastBgFetchAgeMin != null && snap.lastBgFetchAgeMin > 30) {
      issues.push(`BG_FETCH_DEAD_${snap.lastBgFetchAgeMin}min`);
    }
    if (snap.honorStats?.silentDeathCountHour >= 3) issues.push('HONOR_REPEATED_DEATH');
    if (snap.honorStats?.restartCountHour >= 5) issues.push('HONOR_REPEATED_RESTART');
    if (snap.permissions && !snap.permissions.allGranted) issues.push('PERMS_MISSING');
    if (snap.device?.isPowerSaveMode === true) issues.push('POWER_SAVE_ON');
    if (snap.device?.battery != null && snap.device.battery < 0.15) issues.push('LOW_BATTERY');
    if (snap.rnbg?.queueCount > 100) issues.push(`QUEUE_BLOATED_${snap.rnbg.queueCount}`);

    return {
      status: issues.length === 0 ? 'healthy' : (issues.length >= 3 ? 'critical' : 'degraded'),
      issues,
      checkedAtMs: Date.now(),
    };
  }

  listenForCommands() {
    if (!this.driverId) return;
    if (this.commandUnsub) this.commandUnsub();

    this.commandUnsub = firestore()
      .collection('driverDiagnostics').doc(this.driverId)
      .collection('commands')
      .where('status', '==', 'pending')
      .onSnapshot(async (snapshot) => {
        for (const doc of snapshot.docs) {
          const cmd = doc.data();
          console.log('[SelfDiag] 📥 Command received:', cmd.type);
          try {
            await doc.ref.update({
              status: 'processing',
              startedAt: firestore.FieldValue.serverTimestamp(),
            });
            const result = await this.executeCommand(cmd);
            await doc.ref.update({
              status: 'completed',
              completedAt: firestore.FieldValue.serverTimestamp(),
              result: result,
            });
            console.log('[SelfDiag] ✅ Command completed:', cmd.type);
          } catch (e) {
            await doc.ref.update({
              status: 'failed',
              error: e.message || String(e),
              completedAt: firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
            console.warn('[SelfDiag] ❌ Command failed:', cmd.type, e.message);
          }
        }
      }, (err) => console.warn('[SelfDiag] command listener err:', err.message));
  }

  async executeCommand(cmd) {
    switch (cmd.type) {
      case 'snapshot':
        return await this.buildSnapshot();

      case 'restart_rnbg': {
        const TrackingWatchdog = require('./TrackingWatchdog').default;
        const ok = await TrackingWatchdog.hardRestartRNBG();
        return { restarted: ok };
      }

      case 'cycle_wakelock': {
        const LocationService = require('./LocationService').default;
        if (LocationService.cycleRNBG) await LocationService.cycleRNBG();
        return { cycled: true };
      }

      case 'cycle_honor_wakelock': {
        const { BatteryOptimization } = NativeModules;
        if (BatteryOptimization?.cycleHonorWakelock) {
          const r = await BatteryOptimization.cycleHonorWakelock();
          return { result: r };
        }
        return { error: 'native_method_not_available' };
      }

      case 'get_current_position': {
        const loc = await BackgroundGeolocation.getCurrentPosition({
          samples: 1, timeout: 30, persist: true,
        });
        return {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          ts: loc.timestamp,
        };
      }

      case 'flush_queue': {
        const before = await BackgroundGeolocation.getCount();
        await BackgroundGeolocation.sync();
        const after = await BackgroundGeolocation.getCount();
        return { syncedCount: before - after, before, after };
      }

      case 'invalidate_honor_perms': {
        await AsyncStorage.removeItem('honor_p7_confirmed');
        await AsyncStorage.removeItem('honor_p8_confirmed');
        await AsyncStorage.removeItem('honor_p9_confirmed');
        return { invalidated: ['p7', 'p8', 'p9'] };
      }

      case 'reset_counters': {
        await AsyncStorage.multiRemove([
          'honor_restart_count_hour',
          'honor_restart_count_hour_started',
          'silent_death_count_hour',
          'silent_death_count_hour_started',
        ]);
        return { reset: true };
      }

      case 'reload_app': {
        if (NativeModules.DevSettings) NativeModules.DevSettings.reload();
        return { reloading: true };
      }

      default:
        return { unsupported: cmd.type };
    }
  }

  attachErrorHandler() {
    try {
      const orig = global.ErrorUtils?.getGlobalHandler?.() || (() => {});
      global.ErrorUtils?.setGlobalHandler?.((err, isFatal) => {
        try {
          this.errorLog.push({
            message: err?.message || String(err),
            stack: (err?.stack || '').slice(0, 500),
            fatal: !!isFatal,
            ts: Date.now(),
          });
          if (this.errorLog.length > 30) this.errorLog.shift();
        } catch (_) {}
        orig(err, isFatal);
      });
    } catch (e) {
      console.warn('[SelfDiag] attachErrorHandler:', e.message);
    }
  }
}

export default new SelfDiagnostics();
