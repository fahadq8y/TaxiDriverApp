/**
   * Firebase Cloud Functions للمراقبة وإعادة تشغيل التتبع
   *
   * v2.7.2 (30-Apr-2026): تحسينات FCM Wakeup لتجاوز Android FLAG_STOPPED state
   * - إضافة silent notification (مش data-only) عشان يخترق FLAG_STOPPED
   * - threshold زاد من 3 إلى 5 دقائق (يقلل الإزعاج)
   * - فلتر السائقين المهجورين (آخر تحديث > 48 ساعة) لتوفير FCM credits
   * - high-priority + ttl=0 لأقصى أولوية
   */

  const functions = require('firebase-functions');
  const admin = require('firebase-admin');
  admin.initializeApp();

  const db = admin.firestore();

  // مدة الاحتفاظ بالسجلات (7 أيام)
  const TTL_DAYS = 7;
  function expiresAt() {
    return admin.firestore.Timestamp.fromMillis(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  // Threshold: السائق يعتبر "متوقف" إذا ما أرسل موقع لمدة (دقائق)
  const STALE_THRESHOLD_MINUTES = 5;

  // أي سائق آخر تحديث له أكبر من هذا الحد يعتبر "مهجور" (نتجاهله)
  const ABANDONED_THRESHOLD_HOURS = 48;

  // أكواد أخطاء FCM التي تعني أن الـ token غير صالح
  const INVALID_TOKEN_ERRORS = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
  ]);

  /**
   * مراقبة السائقين كل دقيقة
   */
  exports.monitorDrivers = functions.pubsub
    .schedule('every 1 minutes')
    .timeZone('Asia/Kuwait')
    .onRun(async (context) => {
      try {
        console.log('🔍 Starting driver monitoring (v2.7.2)...');

        const now = Date.now();
        const staleThreshold = now - (STALE_THRESHOLD_MINUTES * 60 * 1000);
        const abandonedThreshold = now - (ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000);

        const driversSnapshot = await db.collection('drivers')
          .where('isActive', '==', true)
          .get();

        if (driversSnapshot.empty) {
          console.log('ℹ️ No active drivers found');
          return null;
        }

        console.log(`📊 Found ${driversSnapshot.size} active drivers`);

        const stoppedDrivers = [];
        const abandonedSkipped = [];
        const promises = [];

        driversSnapshot.forEach(doc => {
          const driver = doc.data();
          const lastUpdate = driver.lastUpdate?.toMillis() || 0;

          // تجاهل السائقين المهجورين تماماً (توفير FCM credits)
          if (lastUpdate < abandonedThreshold) {
            abandonedSkipped.push(doc.id);
            return;
          }

          // فحص: متوقف عن الإرسال > threshold
          if (lastUpdate < staleThreshold) {
            const minutesAgo = Math.round((now - lastUpdate) / 60000);
            console.log(`⚠️ Driver ${doc.id} (${driver.name}) stopped - ${minutesAgo} min ago`);

            stoppedDrivers.push({
              id: doc.id,
              name: driver.name || 'غير معروف',
              employeeNumber: driver.employeeNumber || doc.id,
              lastUpdate: new Date(lastUpdate).toLocaleString('ar-SA'),
              lastUpdateTimestamp: lastUpdate,
              minutesAgo: minutesAgo,
            });

            if (driver.fcmToken) {
              promises.push(sendWakeUpPush(doc.id, driver.fcmToken, driver.name));
            }
          }
        });

        if (abandonedSkipped.length > 0) {
          console.log(`🚫 Skipped ${abandonedSkipped.length} abandoned drivers: ${abandonedSkipped.join(', ')}`);
        }

        if (promises.length > 0) {
          await Promise.all(promises);
        }

        if (stoppedDrivers.length > 0) {
          await db.collection('alerts').add({
            type: 'tracking_stopped',
            drivers: stoppedDrivers,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            severity: 'high',
            count: stoppedDrivers.length,
            expiresAt: expiresAt(),
          });

          console.log(`🚨 Alert created for ${stoppedDrivers.length} stopped drivers`);
        } else {
          console.log('✅ All drivers tracking normally');
        }

        return null;
      } catch (error) {
        console.error('❌ Error monitoring drivers:', error);
        return null;
      }
    });

  /**
   * إرسال FCM Wake-up مع silent notification
   * 
   * KEY FIX (v2.7.2): إضافة notification (مش data-only) عشان يخترق FLAG_STOPPED
   * في Android 12+، Force Stop يدخل التطبيق في FLAG_STOPPED state ويبلوك
   * كل data-only messages. لكن notification messages تصل دائماً.
   * 
   * النوتيفيكيشن مخفية تماماً (silent channel + IMPORTANCE_MIN + VISIBILITY_SECRET)
   * لكنها تحيي التطبيق وتشغل الـ background handler.
   */
  async function sendWakeUpPush(driverId, fcmToken, driverName) {
    try {
      console.log(`📲 Sending wake-up to ${driverId} (${driverName})`);

      const message = {
        token: fcmToken,
        // Data payload (يستلمه الـ background handler)
        data: {
          type: 'wake_up',
          action: 'restart_tracking',
          driverId: driverId,
          timestamp: Date.now().toString(),
          // مهم: علّم الرسالة كـ "high importance" للهاندلر يعرف يعالجها فوراً
          priority: 'high',
        },
        // Notification payload (يخترق FLAG_STOPPED + يضمن وصول data للـ handler)
        // هذي القناة 'silent_wake' معرّفة في التطبيق على أنها IMPORTANCE_MIN + مخفية
        notification: {
          title: ' ',  // مسافة - ما يظهر شي
          body: ' ',
        },
        android: {
          priority: 'high',
          ttl: 0,  // لازم يوصل فوراً، لو ما وصل خلال الثانية - لا تخزنه
          collapseKey: `wake_${driverId}`,  // collapse مع رسائل سابقة لنفس السائق
          notification: {
            channelId: 'silent_wake',         // قناة silent معرّفة في التطبيق
            priority: 'min',                   // PRIORITY_MIN
            visibility: 'secret',              // VISIBILITY_SECRET
            notificationCount: 0,
            defaultSound: false,
            defaultVibrateTimings: false,
            defaultLightSettings: false,
            sticky: false,
            localOnly: true,
            // اجعل الإشعار صغير وغير مرئي
            tag: `wake_${driverId}`,
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log(`✅ Wake-up sent to ${driverId}:`, response);

      await db.collection('fcm_logs').add({
        type: 'wake_up',
        driverId: driverId,
        driverName: driverName,
        fcmToken: fcmToken,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        success: true,
        messageId: response,
        method: 'notification+data',  // جديد: نتبع طريقة الإرسال
        expiresAt: expiresAt(),
      });

      return response;
    } catch (error) {
      console.error(`❌ Failed to send wake-up to ${driverId}:`, error);

      let tokenInvalidated = false;
      if (error.code && INVALID_TOKEN_ERRORS.has(error.code)) {
        try {
          await db.collection('drivers').doc(driverId).update({
            fcmToken: admin.firestore.FieldValue.delete(),
            fcmTokenInvalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
            fcmTokenInvalidatedReason: error.code,
          });
          tokenInvalidated = true;
          console.log(`🗑️ Deleted invalid FCM token for ${driverId} (${error.code})`);
        } catch (deleteErr) {
          console.error(`❌ Failed to delete invalid token:`, deleteErr);
        }
      }

      await db.collection('fcm_logs').add({
        type: 'wake_up',
        driverId: driverId,
        driverName: driverName,
        fcmToken: fcmToken,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        success: false,
        error: error.message,
        errorCode: error.code || null,
        tokenInvalidated: tokenInvalidated,
        expiresAt: expiresAt(),
      });

      return null;
    }
  }

  /**
   * تنظيف السجلات القديمة (يومياً)
   */
  exports.cleanupOldRecords = functions.pubsub
    .schedule('every 24 hours')
    .timeZone('Asia/Kuwait')
    .onRun(async (context) => {
      try {
        console.log('🧹 Starting cleanup...');

        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

        const oldAlertsSnapshot = await db.collection('alerts')
          .where('timestamp', '<', new Date(sevenDaysAgo))
          .get();

        if (!oldAlertsSnapshot.empty) {
          const batch = db.batch();
          oldAlertsSnapshot.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          console.log(`✅ Deleted ${oldAlertsSnapshot.size} old alerts`);
        }

        const oldLogsSnapshot = await db.collection('fcm_logs')
          .where('timestamp', '<', new Date(sevenDaysAgo))
          .get();

        if (!oldLogsSnapshot.empty) {
          const batch = db.batch();
          oldLogsSnapshot.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          console.log(`✅ Deleted ${oldLogsSnapshot.size} old FCM logs`);
        }

        const oldEventsSnapshot = await db.collection('tracking_events')
          .where('timestamp', '<', new Date(sevenDaysAgo))
          .get();

        if (!oldEventsSnapshot.empty) {
          const batch = db.batch();
          oldEventsSnapshot.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          console.log(`✅ Deleted ${oldEventsSnapshot.size} old tracking events`);
        }

        console.log('✅ Cleanup completed');
        return null;
      } catch (error) {
        console.error('❌ Cleanup error:', error);
        return null;
      }
    });

  /**
   * إحصائيات يومية (منتصف الليل)
   */
  exports.dailyStats = functions.pubsub
    .schedule('every day 00:00')
    .timeZone('Asia/Kuwait')
    .onRun(async (context) => {
      try {
        console.log('📊 Generating daily stats...');

        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        const activeDriversSnapshot = await db.collection('drivers')
          .where('isActive', '==', true)
          .get();

        const alertsSnapshot = await db.collection('alerts')
          .where('timestamp', '>', new Date(oneDayAgo))
          .get();

        const fcmLogsSnapshot = await db.collection('fcm_logs')
          .where('timestamp', '>', new Date(oneDayAgo))
          .get();

        const successfulPushes = fcmLogsSnapshot.docs.filter(doc => doc.data().success).length;
        const failedPushes = fcmLogsSnapshot.docs.filter(doc => !doc.data().success).length;

        // V2.7.2: حساب نجاح الإيقاظ الفعلي (fcm_restart events)
        const trackingEventsSnapshot = await db.collection('tracking_events')
          .where('timestamp', '>', new Date(oneDayAgo))
          .get();
        const successfulRestarts = trackingEventsSnapshot.docs.filter(d => d.data().type === 'fcm_restart' && d.data().success).length;
        const wakeupEffectiveness = successfulPushes > 0 ? Math.round((successfulRestarts / successfulPushes) * 100) : 0;

        await db.collection('daily_stats').add({
          date: admin.firestore.FieldValue.serverTimestamp(),
          activeDrivers: activeDriversSnapshot.size,
          alerts: alertsSnapshot.size,
          fcmPushes: {
            total: fcmLogsSnapshot.size,
            successful: successfulPushes,
            failed: failedPushes,
          },
          // v2.7.2: نسبة نجاح الإيقاظ الفعلي
          wakeupEffectiveness: {
            attempted: successfulPushes,
            succeeded: successfulRestarts,
            percentage: wakeupEffectiveness,
          },
        });

        console.log('✅ Daily stats generated:', {
          activeDrivers: activeDriversSnapshot.size,
          alerts: alertsSnapshot.size,
          fcmPushes: fcmLogsSnapshot.size,
          wakeupEffectiveness: `${wakeupEffectiveness}%`,
        });

        return null;
      } catch (error) {
        console.error('❌ Daily stats error:', error);
        return null;
      }
    });
  