# Firebase Cloud Functions - Taxi Driver Tracking

## الوظائف

### 1. monitorDrivers
- **التشغيل:** كل دقيقة
- **الوظيفة:** مراقبة السائقين النشطين وكشف التوقفات
- **الإجراء:** إرسال FCM Push لإعادة تشغيل التتبع

### 2. cleanupOldRecords
- **التشغيل:** كل 24 ساعة
- **الوظيفة:** حذف السجلات القديمة (أكثر من 7 أيام)
- **المجموعات:** alerts, fcm_logs, tracking_events

### 3. dailyStats
- **التشغيل:** كل يوم في منتصف الليل
- **الوظيفة:** إنشاء إحصائيات يومية
- **البيانات:** عدد السائقين، التنبيهات، FCM pushes

## التثبيت

```bash
# 1. تثبيت dependencies
cd functions
npm install

# 2. Deploy إلى Firebase
firebase deploy --only functions
```

## الاختبار المحلي

```bash
# تشغيل emulator
npm run serve

# عرض logs
npm run logs
```

## التحديثات في v2.2.5

### Smart Stop Detection
- السائق المتوقف (< 1 km/h): يُكتشف بعد 3 دقائق
- السائق المتحرك: يُكتشف بعد 3 دقائق من آخر تحديث

### FCM Improvements
- إضافة `notification` مع `data` لضمان الوصول بعد Force Stop
- `visibility: secret` - لا تظهر على الشاشة
- `tag: wake_up` - يستبدل الإشعارات السابقة
- `priority: high` - أولوية عالية

### Monitoring
- زيادة threshold من دقيقتين إلى 3 دقائق
- تقليل False Positives
- تحسين دقة الكشف

