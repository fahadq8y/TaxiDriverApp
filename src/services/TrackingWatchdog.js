import BackgroundGeolocation from 'react-native-background-geolocation';
import LocationService from './LocationService';

/**
 * TrackingWatchdog - مراقب التتبع
 * 
 * يفحص كل دقيقة أن التتبع يعمل
 * إذا توقف، يعيد تشغيله تلقائياً
 */
class TrackingWatchdog {
  constructor() {
    this.intervalId = null;
    this.checkInterval = 60000; // كل دقيقة
    this.isRunning = false;
  }
  
  /**
   * بدء المراقبة
   */
  start() {
    if (this.isRunning) {
      console.log('[Watchdog] Already running');
      return;
    }
    
    console.log('[Watchdog] Starting...');
    this.isRunning = true;
    
    // فحص فوري
    this.check();
    
    // فحص دوري كل دقيقة
    this.intervalId = setInterval(() => {
      this.check();
    }, this.checkInterval);
    
    console.log('[Watchdog] Started successfully');
  }
  
  /**
   * فحص حالة التتبع
   */
  async check() {
    try {
      console.log('[Watchdog] Checking tracking state...');
      
      // الحصول على حالة BackgroundGeolocation
      const bgState = await BackgroundGeolocation.getState();
      console.log('[Watchdog] BackgroundGeolocation enabled:', bgState.enabled);
      
      // الحصول على حالة LocationService
      const serviceState = LocationService.getState();
      console.log('[Watchdog] LocationService tracking:', serviceState.isTracking);
      console.log('[Watchdog] Current driverId:', serviceState.currentDriverId);
      
      // إذا كان التتبع يفترض أن يكون نشط لكنه متوقف
      if (serviceState.isTracking && !bgState.enabled) {
        console.warn('[Watchdog] ⚠️ Tracking stopped unexpectedly! Restarting...');
        
        // إعادة تشغيل التتبع
        const driverId = serviceState.currentDriverId;
        if (driverId) {
          try {
            await LocationService.start(driverId);
            console.log('[Watchdog] ✅ Tracking restarted successfully');
          } catch (restartError) {
            console.error('[Watchdog] ❌ Failed to restart tracking:', restartError);
          }
        } else {
          console.error('[Watchdog] ❌ No driverId found, cannot restart tracking');
        }
      } else if (serviceState.isTracking && bgState.enabled) {
        console.log('[Watchdog] ✅ Tracking is running normally');
      } else {
        console.log('[Watchdog] ℹ️ Tracking is not active (expected)');
      }
    } catch (error) {
      console.error('[Watchdog] ❌ Error checking state:', error);
    }
  }
  
  /**
   * إيقاف المراقبة
   */
  stop() {
    if (!this.isRunning) {
      console.log('[Watchdog] Not running');
      return;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    console.log('[Watchdog] Stopped');
  }
  
  /**
   * الحصول على حالة المراقب
   */
  getState() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
    };
  }
}

export default new TrackingWatchdog();

