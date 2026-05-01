import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import LocationService from './LocationService';

/**
 * TrackingWatchdog v2.7.6 (الحل #9)
 *
 * مراقب التتبع المتقدم — يقرأ إعداداته من LocationService.config:
 *   - watchdogEnabled
 *   - watchdogCheckIntervalSec (default 60)
 *   - watchdogMaxDeadTimeSec (default 180)
 *   - autoRestartOnDestroy
 *
 * يفحص دورياً:
 *   1) هل BackgroundGeolocation شغال؟ (state.enabled)
 *   2) هل آخر تحديث لـ lastUpdate في drivers/{id} أحدث من maxDeadTime؟
 *   3) إذا توقف أو تجمد، يعيد التشغيل تلقائياً
 *
 * يكتب نتيجة كل فحص في watchdogLogs/{driverId}_{timestamp}
 */
class TrackingWatchdog {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.lastCheckAt = null;
    this.consecutiveFailures = 0;
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
      console.log('[Watchdog] starting — interval', intervalMs/1000, 's');
      this.isRunning = true;

      // immediate check
      this.check();

      this.intervalId = setInterval(() => this.check(), intervalMs);
    } catch (e) {
      console.warn('[Watchdog] start failed:', e.message);
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
      action: 'none',
      error: null,
    };
    try {
      const bgState = await BackgroundGeolocation.getState();
      result.bgEnabled = bgState.enabled;

      const serviceState = LocationService.getState();
      result.isTrackingExpected = serviceState.isTracking;
      const driverId = serviceState.currentDriverId;

      // Check 1: RNBG dead but expected to be tracking
      if (serviceState.isTracking && !bgState.enabled) {
        console.warn('[Watchdog] ⚠️ RNBG stopped — restarting');
        result.action = 'restart_rnbg';
        if (driverId) {
          try {
            await LocationService.start(driverId);
            console.log('[Watchdog] ✅ Restarted');
            this.consecutiveFailures = 0;
          } catch (e) {
            console.error('[Watchdog] ❌ Restart failed:', e.message);
            result.error = 'restart_failed: ' + e.message;
            this.consecutiveFailures++;
          }
        }
      }
      // Check 2: RNBG running but no location update for too long (frozen)
      else if (serviceState.isTracking && bgState.enabled && driverId) {
        const maxDeadSec = cfg.watchdogMaxDeadTimeSec || 180;
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
                console.warn('[Watchdog] ⚠️ Location frozen — last update', ageSec.toFixed(0), 's ago — restarting');
                result.action = 'restart_frozen';
                try {
                  // Try a soft restart first
                  await BackgroundGeolocation.changePace(true);
                  await new Promise(r => setTimeout(r, 1000));
                  // Then full restart
                  await LocationService.start(driverId);
                  this.consecutiveFailures = 0;
                } catch (e) {
                  result.error = 'frozen_restart_failed: ' + e.message;
                  this.consecutiveFailures++;
                }
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

      // Write watchdog log only when action != 'ok' or every 10th check
      if (result.action !== 'ok' && driverId) {
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

  /**
   * إعادة تشغيل التتبع برمجياً (للاستخدام من config change)
   */
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
    };
  }
}

export default new TrackingWatchdog();
