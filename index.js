/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { version as APP_VERSION } from './package.json';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';

// Register main app component
AppRegistry.registerComponent(appName, () => App);

// Calculate distance between two coordinates in meters (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

// V4 PRO (v2.6.0): حفظ ذكي محسّن في HeadlessTask
// نفس منطق LocationService.shouldSaveToHistory لكن مع AsyncStorage للمزامنة بين App وHeadless
//
// المشاكل اللي حلّيناها (من تحليل DRV030):
//   - 41% نقاط مكررة (نفس مكان نفس ثانية)  → نمنعها
//   - 7 ساعات نوم = 480 نقطة → نخليها ~14 نقطة (1 كل 30د)
//   - 45% قفزات سرعة وهمية بسبب batch upload → دالة onLocation ترفض السرعة العالية
const shouldSaveToHistory = async (location) => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const now = Date.now();
  const currentLat = location.coords.latitude;
  const currentLng = location.coords.longitude;
  const currentSpeed = location.coords.speed ?? 0; // m/s
  // V4: نعتمد على is_moving من Activity Recognition + activity=still
  const isMoving = location.is_moving === true || currentSpeed >= 0.83; // 3 km/h
  const activityType = (location.activity && location.activity.type) || 'unknown';
  const isStill = activityType === 'still';

  try {
    const lastTimeStr = await AsyncStorage.getItem('lastHistorySaveTime');
    const lastLocationStr = await AsyncStorage.getItem('lastHistorySaveLocation');
    const lastIsMovingStr = await AsyncStorage.getItem('lastHistoryIsMoving');

    // أول نقطة دائماً تحفظ
    if (!lastTimeStr || !lastLocationStr) {
      console.log('[shouldSaveToHistory] First location - will save');
      return true;
    }

    const lastHistorySaveTime = parseInt(lastTimeStr, 10);
    const lastHistorySaveLocation = JSON.parse(lastLocationStr);
    const wasMoving = lastIsMovingStr === 'true';
    const timeDiff = now - lastHistorySaveTime;

    // 🛑 V4: منع التكرار التام (<5م في <5 ثوان)
    const distance = calculateDistance(
      lastHistorySaveLocation.latitude,
      lastHistorySaveLocation.longitude,
      currentLat, currentLng
    );
    if (distance < 5 && timeDiff < 5000) {
      console.log('[shouldSaveToHistory] Duplicate point - skipping');
      return false;
    }

    // 🚦 احفظ نقطة "تغيّر حالة" - حركة↔توقف
    if (lastIsMovingStr !== null && wasMoving !== isMoving) {
      console.log(`[shouldSaveToHistory] State change moving=${wasMoving}→${isMoving} - saving transition`);
      return true;
    }

    // 🛑 السائق متوقف فعلاً (isMoving=false أو activity=still)
    if (!isMoving || isStill) {
      // V4: نقطة backup كل 30 دقيقة (بدلاً من 15)
      if (timeDiff >= 1800000) { // 30 دقيقة
        console.log(`[shouldSaveToHistory] Stopped > 30min (${Math.round(timeDiff/60000)}m) - backup point`);
        return true;
      }
      console.log(`[shouldSaveToHistory] Stopped - skip (${Math.round(timeDiff/1000)}s < 1800s)`);
      return false;
    }

    // 🚗 السائق يتحرك: احفظ كل 90 ثانية أو 50 متر
    if (timeDiff >= 90000) {
      console.log(`[shouldSaveToHistory] Moving (${Math.round(currentSpeed*3.6)} km/h) - 90s elapsed`);
      return true;
    }

    if (distance >= 50) {
      console.log(`[shouldSaveToHistory] Moving - moved ${Math.round(distance)}m`);
      return true;
    }

    console.log(`[shouldSaveToHistory] Moving - skip (${Math.round(timeDiff/1000)}s, ${Math.round(distance)}m)`);
    return false;

  } catch (error) {
    console.error('[shouldSaveToHistory] Error:', error);
    return true; // safe default
  }
};

// Register Headless Task for background tracking when app is terminated
// v2.7.8 (الحل #12): Data Compression — buffer points and flush as 1 doc
// المفاتيح في AsyncStorage:
//   compressed_buffer: JSON array of points
//   compressed_buffer_started_at: timestamp of first point in buffer
async function bufferAndFlushCompressed(driverId, point, expiryDate) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const pointsPerBatch = parseInt(await AsyncStorage.getItem('rt_cfg_pointsPerBatch') || '50', 10);
    const maxBatchAgeSec = parseInt(await AsyncStorage.getItem('rt_cfg_maxBatchAgeSec') || '300', 10);

    // Read current buffer
    const bufferRaw = await AsyncStorage.getItem('compressed_buffer');
    let buffer = [];
    if (bufferRaw) {
      try { buffer = JSON.parse(bufferRaw); } catch (_) { buffer = []; }
    }
    let startedAt = parseInt(await AsyncStorage.getItem('compressed_buffer_started_at') || '0', 10);
    if (buffer.length === 0) startedAt = Date.now();

    // Append new point
    buffer.push(point);

    // Decide whether to flush
    const ageSec = (Date.now() - startedAt) / 1000;
    const shouldFlush = buffer.length >= pointsPerBatch || ageSec >= maxBatchAgeSec;

    if (shouldFlush) {
      // Compute aggregates for filtering/indexing without expanding
      const firstTs = buffer[0].timestamp;
      const lastTs = buffer[buffer.length - 1].timestamp;
      const minLat = Math.min(...buffer.map(p => p.latitude));
      const maxLat = Math.max(...buffer.map(p => p.latitude));
      const minLng = Math.min(...buffer.map(p => p.longitude));
      const maxLng = Math.max(...buffer.map(p => p.longitude));
      const avgSpeed = buffer.reduce((s, p) => s + (p.speed||0), 0) / buffer.length;
      const maxSpeed = Math.max(...buffer.map(p => p.speed || 0));

      await firestore().collection('locationHistoryBatched').add({
        driverId: driverId,
        userId: driverId,
        format: 'batched_v1',
        pointsCount: buffer.length,
        startTimestamp: new Date(firstTs),
        endTimestamp: new Date(lastTs),
        durationSec: Math.round((lastTs - firstTs) / 1000),
        bounds: { minLat, maxLat, minLng, maxLng },
        avgSpeed: avgSpeed,
        maxSpeed: maxSpeed,
        firstLocation: { latitude: buffer[0].latitude, longitude: buffer[0].longitude },
        lastLocation: { latitude: buffer[buffer.length-1].latitude, longitude: buffer[buffer.length-1].longitude },
        points: buffer,            // الـ array الكاملة (compressed)
        uploadedAt: new Date(),
        expiryDate: expiryDate,
        appState: 'background',
      });

      console.log('[Compress] ✅ Flushed batch of', buffer.length, 'points (1 doc instead of', buffer.length, ')');

      // Clear buffer
      await AsyncStorage.setItem('compressed_buffer', '[]');
      await AsyncStorage.setItem('compressed_buffer_started_at', '0');
    } else {
      // Save buffer back
      await AsyncStorage.setItem('compressed_buffer', JSON.stringify(buffer));
      await AsyncStorage.setItem('compressed_buffer_started_at', String(startedAt));
      console.log('[Compress] buffered point', buffer.length, '/', pointsPerBatch, '(', ageSec.toFixed(0), 's /', maxBatchAgeSec, 's)');
    }
  } catch (e) {
    console.error('[Compress] error:', e.message);
  }
}

const HeadlessTask = async (event) => {
  const { name, params } = event;

  console.log('[HeadlessTask] Event received:', name);

  if (name === 'location') {
    const location = params;
    console.log('[HeadlessTask] Location received:', location.coords);

    try {
      // Get driver ID from storage
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const driverId = await AsyncStorage.getItem('employeeNumber');

      if (!driverId) {
        console.warn('[HeadlessTask] No driver ID found, skipping location save');
        return;
      }

      // ===== V4 QUALITY FILTERS (v2.6.0) =====
      const speed = location.coords.speed ?? 0;
      const accuracy = location.coords.accuracy ?? 999;
      // 1) رفض النقاط الرديئة (accuracy > 50م)
      if (accuracy > 50) {
        console.warn(`[HeadlessTask] ❌ Rejected: poor accuracy (${accuracy.toFixed(0)}م > 50م)`);
        return;
      }
      // 2) رفض السرعات الوهمية (>200 km/h)
      const speedKmh = speed * 3.6;
      if (speedKmh > 200) {
        console.warn(`[HeadlessTask] ❌ Rejected: impossible speed (${speedKmh.toFixed(0)} km/h)`);
        return;
      }

      console.log('[HeadlessTask] Saving location for driver:', driverId);

      // ✅ v2.5.11: استخراج isMoving + activity + confidence (نفس LocationService.js)
      const isMoving = location.is_moving === true || speed >= 0.83; // 3 km/h
      const activity = (location.activity && location.activity.type) || 'unknown';
      const activityConfidence = (location.activity && location.activity.confidence) || 0;

      // Save to drivers collection (current location)
      await firestore()
        .collection('drivers')
        .doc(driverId)
        .set({
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: speed,
            heading: location.coords.heading || 0,
          },
          // Also save location directly in driver document (for easy access)
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: speed,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading || -1,
          isMoving: isMoving,                      // v2.5.11: حالة الحركة
          currentActivity: activity,               // v2.5.11: النشاط الحالي
          activityConfidence: activityConfidence,  // v2.5.11: ثقة النشاط
          lastUpdate: new Date(),
          isActive: true,
        }, { merge: true });

      console.log('[HeadlessTask] Location saved successfully to drivers collection');

      // Save to locationHistory if conditions are met
      if (await shouldSaveToHistory(location)) {
        try {
          // v2.7.8 (الحل #12): تحقق من compression flag
          const compressionEnabled = (await AsyncStorage.getItem('rt_cfg_compressionEnabled')) === 'true';

          // Calculate expiry date (2 months from now)
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 2);

          const point = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || 0,
            speed: speed,
            heading: location.coords.heading || 0,
            isMoving: isMoving,
            activity: activity,
            currentActivity: activity,
            activityConfidence: activityConfidence,
            timestamp: location.timestamp ? new Date(location.timestamp).getTime() : Date.now(),
            deviceTimestamp: location.timestamp ? new Date(location.timestamp).getTime() : Date.now(),
          };

          if (compressionEnabled) {
            // v2.7.8: COMPRESSED — buffer + flush
            await bufferAndFlushCompressed(driverId, point, expiryDate);
          } else {
            // LEGACY: 1 document per point in locationHistory
            await firestore()
              .collection('locationHistory')
              .add({
                driverId: driverId,
                ...point,
                timestamp: new Date(point.timestamp),
                deviceTimestamp: new Date(point.deviceTimestamp),
                uploadedAt: new Date(),
                expiryDate: expiryDate,
                appState: 'background',
                userId: driverId,
              });
            console.log('[HeadlessTask] Location saved to locationHistory (legacy)');
          }

          // Update last save time and location in AsyncStorage
          await AsyncStorage.setItem('lastHistorySaveTime', Date.now().toString());
          await AsyncStorage.setItem('lastHistorySaveLocation', JSON.stringify({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }));
          await AsyncStorage.setItem('lastHistoryIsMoving', String(isMoving));
        } catch (historyError) {
          console.error('[HeadlessTask] Error saving to locationHistory:', historyError);
        }
      } else {
        console.log('[HeadlessTask] Skipping locationHistory save (conditions not met)');
      }

    } catch (error) {
      console.error('[HeadlessTask] Error saving location:', error);
    }
  }
};

// Register the headless task
BackgroundGeolocation.registerHeadlessTask(HeadlessTask);

// ===== v2.7.7 (الحل #4): BACKGROUND FETCH =====
// كل 15 دقيقة، حتى لو التطبيق ميت تماماً، Android يستيقظ ويشغل هذه المهمة.
// تخدم كحزام أمان احتياطي: تتأكد أن BackgroundGeolocation شغال + يدفع أي بيانات متراكمة.
let BackgroundFetch = null;
try {
  BackgroundFetch = require('react-native-background-fetch').default;
} catch (e) {
  console.warn('[BG-Fetch] module not installed');
}

if (BackgroundFetch) {
  const bgFetchHandler = async (taskId) => {
    console.log('[BG-Fetch] task started:', taskId);
    try {
      // 1) تأكد أن RNBG شغال
      const state = await BackgroundGeolocation.getState();
      if (!state.enabled) {
        console.log('[BG-Fetch] RNBG stopped — restarting');
        await BackgroundGeolocation.start();
      }
      // 2) ادفع أي بيانات متراكمة محلياً
      const queueCount = await BackgroundGeolocation.getCount();
      if (queueCount > 0) {
        console.log('[BG-Fetch] syncing', queueCount, 'queued records');
        await BackgroundGeolocation.sync();
      }
      // 3) سجل في Firestore أن الـ background fetch اشتغل
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const driverId = await AsyncStorage.getItem('employeeNumber');
        if (driverId) {
          await firestore().collection('drivers').doc(driverId).set({
            lastBgFetchAt: firestore.FieldValue.serverTimestamp(),
            lastBgFetchTaskId: taskId,
            appVersion: APP_VERSION,
          }, { merge: true });
        }
      } catch (e) { console.warn('[BG-Fetch] firestore log failed:', e.message); }
    } catch (e) {
      console.error('[BG-Fetch] handler error:', e.message);
    } finally {
      BackgroundFetch.finish(taskId);
    }
  };

  const bgFetchTimeoutHandler = (taskId) => {
    console.warn('[BG-Fetch] task timeout:', taskId);
    BackgroundFetch.finish(taskId);
  };

  BackgroundFetch.configure({
    minimumFetchInterval: 15,            // 15 دقيقة (حد Android الأدنى)
    stopOnTerminate: false,              // يكمل حتى لو السائق سحب التطبيق
    startOnBoot: true,                   // يشتغل بعد إعادة تشغيل الجهاز
    enableHeadless: true,                // يشتغل حتى لو التطبيق ميت
    requiredNetworkType: BackgroundFetch.NETWORK_TYPE_NONE,
    requiresCharging: false,
    requiresDeviceIdle: false,
    requiresBatteryNotLow: false,
    requiresStorageNotLow: false,
  }, bgFetchHandler, bgFetchTimeoutHandler).then((status) => {
    console.log('[BG-Fetch] configured — status:', status);
  }).catch((e) => {
    console.warn('[BG-Fetch] configure failed:', e.message);
  });

  // سجل مهمة headless للـ background-fetch
  BackgroundFetch.registerHeadlessTask(async ({ taskId }) => {
    console.log('[BG-Fetch:Headless] taskId=', taskId);
    await bgFetchHandler(taskId);
  });
}

// ===== FCM WAKE-UP HANDLER (v2.7.2) =====
  // Enhanced handler to bypass Android FLAG_STOPPED state.
  // Triggered by silent notification + data message from monitorDrivers Cloud Function.
  //
  // Flow:
  //   1. monitorDrivers يكتشف driver متوقف
  //   2. يرسل FCM (silent notification + data)
  //   3. Android يحيي التطبيق (حتى بعد Force Stop)
  //   4. هذا الhandler يبدأ التتبع + يسجل النجاح

  const handleWakeUpMessage = async (remoteMessage) => {
    console.log('[FCM] Wake-up message received:', JSON.stringify(remoteMessage));

    try {
      if (remoteMessage.data?.type !== 'wake_up') {
        console.log('[FCM] Not a wake-up message - ignoring');
        return;
      }

      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const driverId = remoteMessage.data.driverId || await AsyncStorage.getItem('employeeNumber');

      if (!driverId) {
        console.warn('[FCM] No driver ID found - cannot restart tracking');
        return;
      }

      console.log('[FCM] Restarting tracking for driver:', driverId);

      // محاولة 1: BackgroundGeolocation.start
      let bgRestartOk = false;
      let bgError = null;
      try {
        const state = await BackgroundGeolocation.start();
        console.log('[FCM] ✅ BackgroundGeolocation restarted:', state.enabled);
        bgRestartOk = true;
      } catch (e) {
        bgError = e.message || String(e);
        console.error('[FCM] ❌ BackgroundGeolocation.start failed:', bgError);
      }

      // محاولة 2: getCurrentPosition - يجبر التتبع على إرسال موقع فوري
      let firstLocationOk = false;
      if (bgRestartOk) {
        try {
          const location = await BackgroundGeolocation.getCurrentPosition({
            timeout: 30,
            maximumAge: 5000,
            desiredAccuracy: 10,
            samples: 1,
            persist: true,
          });
          console.log('[FCM] ✅ Got fresh location after wake-up');
          firstLocationOk = !!(location && location.coords);
        } catch (locErr) {
          console.warn('[FCM] ⚠️ getCurrentPosition failed:', locErr.message);
        }
      }

      // تسجيل النتيجة في Firestore
      await firestore()
        .collection('tracking_events')
        .add({
          type: 'fcm_restart',
          driverId: driverId,
          timestamp: firestore.FieldValue.serverTimestamp(),
          success: bgRestartOk,
          firstLocationOk: firstLocationOk,
          error: bgError,
          appVersion: APP_VERSION,
          method: 'silent_notification',
          wakeupSource: remoteMessage.from || 'unknown',
          messageId: remoteMessage.messageId || null,
        });

      // تحديث lastFcmWakeup في drivers/{id} (heartbeat)
      try {
        await firestore()
          .collection('drivers')
          .doc(driverId)
          .set({
            lastFcmWakeup: firestore.FieldValue.serverTimestamp(),
            lastFcmWakeupSuccess: bgRestartOk,
          }, { merge: true });
      } catch (e) {
        console.warn('[FCM] Failed to update wakeup heartbeat:', e.message);
      }

    } catch (error) {
      console.error('[FCM] ❌ Critical error handling wake-up:', error);
    }
  };

  // Background handler (التطبيق مغلق أو في الخلفية)
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    await handleWakeUpMessage(remoteMessage);
    return Promise.resolve();
  });

  // Foreground handler (التطبيق مفتوح)
  messaging().onMessage(async remoteMessage => {
    await handleWakeUpMessage(remoteMessage);
  });

  console.log('[FCM] v' + APP_VERSION + ' Wake-up handlers registered (background + foreground)');
