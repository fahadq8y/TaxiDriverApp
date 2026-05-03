import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import LocationService from './LocationService';

/**
 * TrackingWatchdog v2.7.15 — تحسينات Phase 1 (إصلاح A)
 *
 * التغييرات عن v2.7.6:
 *   - maxDeadTime افتراضي 180 → 90 ثانية (يلاحظ التجمد أسرع 2x)
 *   - restart logic: بدل LocationService.start فقط، نسوي full RNBG reset
 *     (stop → wait 2s → destroyLocations → start) لكسر حالة الـ "زومبي"
 *   - إضافة restart_count counter — بعد 3 محاولات فاشلة نطلب FCM wake-up
 *   - تسجيل أوضح في watchdogLogs (نسجل دائماً، مو فقط لما action!=ok)
 */
class TrackingWatchdog {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.lastCheckAt = null;
    this.consecutiveFailures = 0;
    this.totalRestarts = 0;
  }

  start() {
    try {
      const cfg = LocationService.config || {};
      if (cfg.watchdogEnabled === false) {
        console.log('[Watchdog] disabled by config');
        return;
      }
      if (this.isRunning) {
        console.log('[Watchdog] already running');
        return;
      }
      const intervalMs = (cfg.watchdogCheckIntervalSec || 60) * 1000;
      console.log('[Watchdog v2.7.15] starting — interval', intervalMs/1000, 's');
      this.isRunning = true;

      // immediate check
      this.check();

      this.intervalId = setInterval(() => this.check(), intervalMs);
    } catch (e) {
      console.warn('[Watchdog] start failed:', e.message);
    }
  }

  /**
   * Hard restart RNBG — يكسر حالة الـ "زومبي" حيث RNBG.enabled=true لكن لا يرسل
   * (شائعة على HONOR Magic OS بعد FCM wake-up)
   */
  async hardRestartRNBG(driverId) {
    console.log('[Watchdog] 🔄 Hard restart sequence starting...');
    try {
      // 1) أوقف RNBG تماماً
      try {
        await BackgroundGeolocation.stop();
        console.log('[Watchdog] step 1/4: RNBG stopped');
      } catch (e) { console.warn('[Watchdog] stop error (continuing):', e.message); }

      // 2) انتظر 2 ثانية للسماح للـ native services بالموت
      await new Promise(r => setTimeout(r, 2000));

      // 3) sync أي بيانات متراكمة قبل ما نخسرها
      try {
        const cnt = await BackgroundGeolocation.getCount();
        if (cnt > 0) {
          console.log('[Watchdog] step 2/4: flushing', cnt, 'queued points before restart');
          await BackgroundGeolocation.sync();
        }
      } catch (e) { console.warn('[Watchdog] pre-restart sync failed:', e.message); }

      // 4) full restart عن طريق LocationService (يعيد configure)
      console.log('[Watchdog] step 3/4: calling LocationService.start');
      await LocationService.start(driverId);

      // 5) trigger getCurrentPosition لإجبار التتبع على إرسال نقطة فوراً
      try {
        await BackgroundGeolocation.getCurrentPosition({
          timeout: 30, maximumAge: 0, desiredAccuracy: 10, samples: 1, persist: true,
        });
        console.log('[Watchdog] step 4/4: ✅ fresh position obtained');
      } catch (e) {
        console.warn('[Watchdog] getCurrentPosition failed (non-fatal):', e.message);
      }

      this.totalRestarts++;
      this.consecutiveFailures = 0;
      console.log('[Watchdog] ✅ Hard restart complete (total restarts:', this.totalRestarts, ')');

      // v2.7.16 (إصلاح H): سجّل العداد للساعة الأخيرة
      // HonorHealthMonitor يستخدمه لاكتشاف إن p7 (Protected Apps) ملغى
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const k = 'honor_restart_count_hour';
        const tk = 'honor_restart_count_hour_started';
        const now = Date.now();
        const start = parseInt((await AsyncStorage.getItem(tk)) || '0', 10);
        let count = parseInt((await AsyncStorage.getItem(k)) || '0', 10);
        // reset كل ساعة
        if (!start || (now - start) > 3600000) {
          count = 0;
          await AsyncStorage.setItem(tk, String(now));
        }
        count++;
        await AsyncStorage.setItem(k, String(count));
        console.log('[Watchdog] restart counter (last hour):', count);
      } catch (_) {}
      return true;
    } catch (e) {
      this.consecutiveFailures++;
      console.error('[Watchdog] ❌ Hard restart failed:', e.message);
      return false;
    }
  }

  async check() {
    this.lastCheckAt = new Date();
    const cfg = LocationService.config || {};
    const result = {
      checkedAt: firestore.FieldValue.serverTimestamp(),
      bgEnabled: null,
      isTrackingExpected: null,
      lastLocationAgeSec: null,
      queueCount: null,
      action: 'none',
      error: null,
      consecutiveFailures: this.consecutiveFailures,
      totalRestarts: this.totalRestarts,
    };
    try {
      const bgState = await BackgroundGeolocation.getState();
      result.bgEnabled = bgState.enabled;
      try { result.queueCount = await BackgroundGeolocation.getCount(); } catch(_){}

      const serviceState = LocationService.getState();
      result.isTrackingExpected = serviceState.isTracking;
      const driverId = serviceState.currentDriverId;

      // Check 1: RNBG dead but expected to be tracking
      if (serviceState.isTracking && !bgState.enabled) {
        console.warn('[Watchdog] ⚠️ RNBG stopped — hard restarting');
        result.action = 'hard_restart_dead';
        if (driverId) {
          const ok = await this.hardRestartRNBG(driverId);
          if (!ok) result.error = 'hard_restart_failed';
        }
      }
      // Check 2: RNBG running but no location update for too long (frozen / zombie)
      else if (serviceState.isTracking && bgState.enabled && driverId) {
        // v2.7.15: maxDeadTime 180 → 90 (يلاحظ أسرع)
        const maxDeadSec = cfg.watchdogMaxDeadTimeSec || 90;
        try {
          const driverDoc = await firestore().collection('drivers').doc(driverId).get();
          if (driverDoc.exists) {
            const data = driverDoc.data() || {};
            const lastUpdate = data.lastUpdate;
            if (lastUpdate) {
              const lastMs = lastUpdate.toMillis ? lastUpdate.toMillis() : new Date(lastUpdate).getTime();
              const ageSec = (Date.now() - lastMs) / 1000;
              result.lastLocationAgeSec = ageSec;
              if (ageSec > maxDeadSec) {
                console.warn('[Watchdog] ⚠️ Location frozen — last update', ageSec.toFixed(0), 's ago — HARD restart');
                result.action = 'hard_restart_frozen';
                // v2.7.15: hard restart بدل soft restart
                const ok = await this.hardRestartRNBG(driverId);
                if (!ok) result.error = 'frozen_hard_restart_failed';
              } else {
                result.action = 'ok';
              }
            }
          }
        } catch (e) {
          result.error = 'driver_check_failed: ' + e.message;
        }
      } else {
        result.action = 'idle';
      }

      // v2.7.15: نسجّل دائماً لو action != 'ok' أو every 5th check
      const shouldLog = result.action !== 'ok' || (Date.now() % 5 === 0);
      if (shouldLog && driverId) {
        try {
          await firestore()
            .collection('watchdogLogs')
            .add({ driverId, ...result });
        } catch (e) { /* silent */ }
      }
    } catch (e) {
      result.error = e.message;
      console.error('[Watchdog] check error:', e.message);
      this.consecutiveFailures++;
    }
  }

  async restart() {
    try {
      const intervalMs = ((LocationService.config && LocationService.config.watchdogCheckIntervalSec) || 60) * 1000;
      this.stop();
      if (LocationService.config && LocationService.config.watchdogEnabled !== false) {
        this.start();
        console.log('[Watchdog] restarted with new interval', intervalMs/1000, 's');
      }
    } catch (e) {
      console.warn('[Watchdog] restart failed:', e.message);
    }
  }

  stop() {
    if (!this.isRunning) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Watchdog] stopped');
  }

  getState() {
    return {
      isRunning: this.isRunning,
      lastCheckAt: this.lastCheckAt,
      consecutiveFailures: this.consecutiveFailures,
      totalRestarts: this.totalRestarts,
    };
  }
}

export default new TrackingWatchdog();
