/**
 * Firebase Cloud Function - Driver Tracking Monitor
 * 
 * يراقب السائقين النشطين كل 5 دقائق
 * إذا توقف سائق عن الإرسال، يرسل تنبيه
 * 
 * للنشر:
 * 1. انسخ هذا الملف إلى: functions/index.js
 * 2. cd functions
 * 3. npm install
 * 4. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * مراقبة التتبع - يعمل كل 5 دقائق
 */
exports.monitorDriverTracking = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone('Asia/Kuwait') // توقيت الكويت
  .onRun(async (context) => {
    try {
      console.log('🔍 Starting driver tracking monitor...');
      
      const now = admin.firestore.Timestamp.now();
      const fiveMinutesAgo = new Date(now.toDate().getTime() - 5 * 60 * 1000);
      
      // جلب السائقين النشطين
      const driversSnapshot = await admin.firestore()
        .collection('drivers')
        .where('isActive', '==', true)
        .get();
      
      console.log(`📊 Found ${driversSnapshot.size} active drivers`);
      
      const alerts = [];
      const inactiveDrivers = [];
      
      driversSnapshot.forEach(doc => {
        const driver = doc.data();
        const lastUpdate = driver.lastUpdate?.toDate();
        
        if (!lastUpdate) {
          console.warn(`⚠️ Driver ${doc.id} has no lastUpdate timestamp`);
          return;
        }
        
        // إذا آخر تحديث أكثر من 5 دقائق
        if (lastUpdate < fiveMinutesAgo) {
          const minutesInactive = Math.floor((now.toDate() - lastUpdate) / 60000);
          
          alerts.push({
            driverId: doc.id,
            driverName: driver.driverName || doc.id,
            lastUpdate: lastUpdate,
            minutesInactive: minutesInactive,
            message: `السائق ${driver.driverName || doc.id} توقف عن الإرسال منذ ${minutesInactive} دقيقة`
          });
          
          inactiveDrivers.push(doc.id);
          
          console.warn(`⚠️ ${driver.driverName || doc.id} inactive for ${minutesInactive} minutes`);
        } else {
          console.log(`✅ ${driver.driverName || doc.id} is active`);
        }
      });
      
      // حفظ التنبيهات في collection
      if (alerts.length > 0) {
        console.log(`⚠️ Found ${alerts.length} inactive drivers`);
        
        // حفظ في collection trackingAlerts
        const batch = admin.firestore().batch();
        
        alerts.forEach(alert => {
          const alertRef = admin.firestore().collection('trackingAlerts').doc();
          batch.set(alertRef, {
            ...alert,
            timestamp: now,
            resolved: false,
            type: 'tracking_stopped'
          });
        });
        
        await batch.commit();
        console.log('✅ Alerts saved to trackingAlerts collection');
        
        // يمكن إضافة إرسال SMS أو Email هنا
        // await sendSMSAlert(alerts);
        // await sendEmailAlert(alerts);
      } else {
        console.log('✅ All drivers are tracking normally');
      }
      
      // إحصائيات
      const stats = {
        timestamp: now,
        totalActiveDrivers: driversSnapshot.size,
        trackingNormally: driversSnapshot.size - alerts.length,
        trackingStopped: alerts.length,
        inactiveDriverIds: inactiveDrivers
      };
      
      // حفظ الإحصائيات
      await admin.firestore()
        .collection('trackingStats')
        .add(stats);
      
      console.log('📊 Stats:', stats);
      console.log('✅ Monitor completed');
      
      return null;
    } catch (error) {
      console.error('❌ Error in monitor:', error);
      return null;
    }
  });

/**
 * تنظيف التنبيهات القديمة - يعمل يومياً
 */
exports.cleanupOldAlerts = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Asia/Kuwait')
  .onRun(async (context) => {
    try {
      console.log('🧹 Cleaning up old alerts...');
      
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // حذف التنبيهات الأقدم من 7 أيام
      const oldAlertsSnapshot = await admin.firestore()
        .collection('trackingAlerts')
        .where('timestamp', '<', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
        .get();
      
      if (oldAlertsSnapshot.empty) {
        console.log('✅ No old alerts to clean');
        return null;
      }
      
      const batch = admin.firestore().batch();
      oldAlertsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`✅ Deleted ${oldAlertsSnapshot.size} old alerts`);
      
      return null;
    } catch (error) {
      console.error('❌ Error cleaning up alerts:', error);
      return null;
    }
  });

/**
 * تنظيف الإحصائيات القديمة - يعمل أسبوعياً
 */
exports.cleanupOldStats = functions.pubsub
  .schedule('every 7 days')
  .timeZone('Asia/Kuwait')
  .onRun(async (context) => {
    try {
      console.log('🧹 Cleaning up old stats...');
      
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // حذف الإحصائيات الأقدم من 30 يوم
      const oldStatsSnapshot = await admin.firestore()
        .collection('trackingStats')
        .where('timestamp', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .get();
      
      if (oldStatsSnapshot.empty) {
        console.log('✅ No old stats to clean');
        return null;
      }
      
      const batch = admin.firestore().batch();
      oldStatsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`✅ Deleted ${oldStatsSnapshot.size} old stats`);
      
      return null;
    } catch (error) {
      console.error('❌ Error cleaning up stats:', error);
      return null;
    }
  });

/**
 * مثال: إرسال SMS عند توقف التتبع
 * (يحتاج Twilio أو خدمة SMS أخرى)
 */
/*
async function sendSMSAlert(alerts) {
  // TODO: إضافة Twilio أو خدمة SMS
  console.log('📱 Would send SMS for:', alerts.length, 'alerts');
}
*/

/**
 * مثال: إرسال Email عند توقف التتبع
 * (يحتاج SendGrid أو خدمة Email أخرى)
 */
/*
async function sendEmailAlert(alerts) {
  // TODO: إضافة SendGrid أو خدمة Email
  console.log('📧 Would send email for:', alerts.length, 'alerts');
}
*/

