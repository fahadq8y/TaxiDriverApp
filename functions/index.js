/**
 * Firebase Cloud Functions للمراقبة وإعادة تشغيل التتبع
 * 
 * التثبيت:
 * 1. npm install -g firebase-tools
 * 2. firebase login
 * 3. firebase init functions
 * 4. انسخ هذا الكود إلى functions/index.js
 * 5. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// مدة الاحتفاظ بالسجلات (7 أيام). Firestore TTL policy يحذفها تلقائياً.
// لتفعيل TTL في Firebase Console:
//   Firestore → TTL → Create policy
//   Collection: alerts        | Field: expiresAt
//   Collection: fcm_logs      | Field: expiresAt
//   Collection: tracking_events | Field: expiresAt
const TTL_DAYS = 7;
function expiresAt() {
  return admin.firestore.Timestamp.fromMillis(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
}

// أكواد أخطاء FCM التي تعني أن الـ token غير صالح ويجب حذفه
const INVALID_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * مراقبة السائقين كل دقيقة
 * يكتشف السائقين الذين توقف تتبعهم ويرسل تنبيهات
 */
exports.monitorDrivers = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('Asia/Kuwait') // غير حسب منطقتك الزمنية
  .onRun(async (context) => {
    try {
      console.log('🔍 Starting driver monitoring...');
      
      const now = Date.now();
      const threeMinutesAgo = now - (3 * 60 * 1000); // زيادة إلى 3 دقائق لتقليل False Positives
      
      // البحث عن سائقين نشطين
      const driversSnapshot = await db.collection('drivers')
        .where('isActive', '==', true)
        .get();
      
      if (driversSnapshot.empty) {
        console.log('ℹ️ No active drivers found');
        return null;
      }
      
      console.log(`📊 Found ${driversSnapshot.size} active drivers`);
      
      const stoppedDrivers = [];
      const promises = [];
      
      // فحص كل سائق
      driversSnapshot.forEach(doc => {
        const driver = doc.data();
        const lastUpdate = driver.lastUpdate?.toMillis() || 0;
        
        if (lastUpdate < threeMinutesAgo) {
          console.log(`⚠️ Driver ${doc.id} (${driver.name}) stopped - last update: ${new Date(lastUpdate).toLocaleString('ar-SA')}`);
          
          stoppedDrivers.push({
            id: doc.id,
            name: driver.name || 'غير معروف',
            employeeNumber: driver.employeeNumber || doc.id,
            lastUpdate: new Date(lastUpdate).toLocaleString('ar-SA'),
            lastUpdateTimestamp: lastUpdate,
            fcmToken: driver.fcmToken,
          });
          
          // إرسال FCM Push لإعادة التشغيل
          if (driver.fcmToken) {
            promises.push(sendWakeUpPush(doc.id, driver.fcmToken, driver.name));
          }
        }
      });
      
      // انتظار إرسال كل الـ pushes
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      
      // حفظ التنبيه في Firestore
      if (stoppedDrivers.length > 0) {
        await db.collection('alerts').add({
          type: 'tracking_stopped',
          drivers: stoppedDrivers,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          severity: 'high',
          count: stoppedDrivers.length,
          expiresAt: expiresAt(), // TTL: حذف تلقائي بعد 7 أيام
        });
        
        console.log(`🚨 Alert created for ${stoppedDrivers.length} stopped drivers`);
      } else {
        console.log('✅ All drivers are tracking normally');
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error monitoring drivers:', error);
      return null;
    }
  });

/**
 * إرسال FCM Push لإيقاظ التطبيق
 */
async function sendWakeUpPush(driverId, fcmToken, driverName) {
  try {
    console.log(`📲 Sending wake-up push to ${driverId} (${driverName})`);
    
    const message = {
      token: fcmToken,
      data: {
        type: 'wake_up',
        action: 'restart_tracking',
        driverId: driverId,
        timestamp: Date.now().toString(),
      },
      // إزالة notification لإخفاء الإشعار تماماً
      // استخدام data-only message (silent push)
      android: {
        priority: 'high',
      },
    };
    
    const response = await admin.messaging().send(message);
    console.log(`✅ Wake-up push sent successfully to ${driverId}:`, response);
    
    // تسجيل الإرسال
    await db.collection('fcm_logs').add({
      type: 'wake_up',
      driverId: driverId,
      driverName: driverName,
      fcmToken: fcmToken,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: true,
      messageId: response,
      expiresAt: expiresAt(), // TTL: حذف تلقائي بعد 7 أيام
    });
    
    return response;
  } catch (error) {
    console.error(`❌ Failed to send wake-up push to ${driverId}:`, error);
    
    // C2: حذف الـ FCM token لو كان غير صالح (يعالج 36% من فشل الإشعارات)
    // الـ token راح يتجدد تلقائياً لما السائق يفتح التطبيق (onTokenRefresh)
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
        console.error(`❌ Failed to delete invalid token for ${driverId}:`, deleteErr);
      }
    }
    
    // تسجيل الفشل
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
      expiresAt: expiresAt(), // TTL: حذف تلقائي بعد 7 أيام
    });
    
    return null;
  }
}

/**
 * تنظيف السجلات القديمة (يعمل يومياً)
 */
exports.cleanupOldRecords = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Asia/Kuwait')
  .onRun(async (context) => {
    try {
      console.log('🧹 Starting cleanup...');
      
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      
      // حذف alerts القديمة
      const oldAlertsSnapshot = await db.collection('alerts')
        .where('timestamp', '<', new Date(sevenDaysAgo))
        .get();
      
      if (!oldAlertsSnapshot.empty) {
        const batch = db.batch();
        oldAlertsSnapshot.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`✅ Deleted ${oldAlertsSnapshot.size} old alerts`);
      }
      
      // حذف fcm_logs القديمة
      const oldLogsSnapshot = await db.collection('fcm_logs')
        .where('timestamp', '<', new Date(sevenDaysAgo))
        .get();
      
      if (!oldLogsSnapshot.empty) {
        const batch = db.batch();
        oldLogsSnapshot.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`✅ Deleted ${oldLogsSnapshot.size} old FCM logs`);
      }
      
      // حذف tracking_events القديمة
      const oldEventsSnapshot = await db.collection('tracking_events')
        .where('timestamp', '<', new Date(sevenDaysAgo))
        .get();
      
      if (!oldEventsSnapshot.empty) {
        const batch = db.batch();
        oldEventsSnapshot.forEach(doc => {
          batch.delete(doc.ref);
        });
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
 * إحصائيات يومية (يعمل كل يوم في منتصف الليل)
 */
exports.dailyStats = functions.pubsub
  .schedule('every day 00:00')
  .timeZone('Asia/Kuwait')
  .onRun(async (context) => {
    try {
      console.log('📊 Generating daily stats...');
      
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      
      // عدد السائقين النشطين
      const activeDriversSnapshot = await db.collection('drivers')
        .where('isActive', '==', true)
        .get();
      
      // عدد التنبيهات اليوم
      const alertsSnapshot = await db.collection('alerts')
        .where('timestamp', '>', new Date(oneDayAgo))
        .get();
      
      // عدد FCM pushes اليوم
      const fcmLogsSnapshot = await db.collection('fcm_logs')
        .where('timestamp', '>', new Date(oneDayAgo))
        .get();
      
      const successfulPushes = fcmLogsSnapshot.docs.filter(doc => doc.data().success).length;
      const failedPushes = fcmLogsSnapshot.docs.filter(doc => !doc.data().success).length;
      
      // حفظ الإحصائيات
      await db.collection('daily_stats').add({
        date: admin.firestore.FieldValue.serverTimestamp(),
        activeDrivers: activeDriversSnapshot.size,
        alerts: alertsSnapshot.size,
        fcmPushes: {
          total: fcmLogsSnapshot.size,
          successful: successfulPushes,
          failed: failedPushes,
        },
      });
      
      console.log('✅ Daily stats generated:', {
        activeDrivers: activeDriversSnapshot.size,
        alerts: alertsSnapshot.size,
        fcmPushes: fcmLogsSnapshot.size,
      });
      
      return null;
    } catch (error) {
      console.error('❌ Daily stats error:', error);
      return null;
    }
  });

