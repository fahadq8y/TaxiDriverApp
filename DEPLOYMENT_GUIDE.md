# دليل النشر - TaxiDriverApp v2.2.5

## 📋 المتطلبات

### 1. Firebase CLI
```bash
npm install -g firebase-tools
firebase --version  # يجب أن يكون >= 12.0.0
```

### 2. تسجيل الدخول
```bash
firebase login
```

### 3. اختيار المشروع
```bash
cd /path/to/TaxiDriverApp
firebase use taxi-management-system-d8210
```

---

## 🚀 نشر Cloud Functions

### الخطوة 1: تثبيت Dependencies
```bash
cd functions
npm install
```

### الخطوة 2: اختبار محلي (اختياري)
```bash
npm run serve
# سيفتح emulator على http://localhost:5001
```

### الخطوة 3: Deploy إلى Firebase
```bash
cd ..
firebase deploy --only functions
```

**المتوقع:**
```
✔  functions: Finished running predeploy script.
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (XX.XX KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: creating Node.js 18 function monitorDrivers(us-central1)...
i  functions: creating Node.js 18 function cleanupOldRecords(us-central1)...
i  functions: creating Node.js 18 function dailyStats(us-central1)...
✔  functions[monitorDrivers(us-central1)] Successful create operation.
✔  functions[cleanupOldRecords(us-central1)] Successful create operation.
✔  functions[dailyStats(us-central1)] Successful create operation.

✔  Deploy complete!
```

### الخطوة 4: التحقق
```bash
firebase functions:log
```

**يجب أن ترى:**
```
🔍 Starting driver monitoring...
📊 Found X active drivers
✅ All drivers are tracking normally
```

---

## 📱 بناء APK

### الخطوة 1: تنظيف البناء السابق
```bash
cd android
./gradlew clean
```

### الخطوة 2: بناء Release APK
```bash
./gradlew assembleRelease
```

**الملف الناتج:**
```
android/app/build/outputs/apk/release/app-release.apk
```

### الخطوة 3: توقيع APK (للإنتاج)

**إذا لم يكن لديك keystore:**
```bash
keytool -genkey -v -keystore taxi-driver.keystore -alias taxi-driver -keyalg RSA -keysize 2048 -validity 10000
```

**إضافة إلى android/gradle.properties:**
```properties
MYAPP_RELEASE_STORE_FILE=taxi-driver.keystore
MYAPP_RELEASE_KEY_ALIAS=taxi-driver
MYAPP_RELEASE_STORE_PASSWORD=your_password
MYAPP_RELEASE_KEY_PASSWORD=your_password
```

**تحديث android/app/build.gradle:**
```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            ...
        }
    }
}
```

**بناء APK موقّع:**
```bash
./gradlew assembleRelease
```

---

## 🧪 الاختبار

### 1. اختبار Cloud Functions

**في Firebase Console:**
1. افتح https://console.firebase.google.com/project/taxi-management-system-d8210/functions
2. تأكد من وجود 3 functions:
   - `monitorDrivers` - يعمل كل دقيقة
   - `cleanupOldRecords` - يعمل كل 24 ساعة
   - `dailyStats` - يعمل كل يوم منتصف الليل

**اختبار يدوي:**
```bash
# عرض logs
firebase functions:log --only monitorDrivers

# اختبار محلي
cd functions
npm run serve
# ثم في terminal آخر:
firebase functions:shell
> monitorDrivers()
```

### 2. اختبار APK

**على جهاز حقيقي:**
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

**سيناريوهات الاختبار:**
1. ✅ تسجيل الدخول
2. ✅ بدء التتبع تلقائياً
3. ✅ التتبع يستمر في الخلفية
4. ✅ إعادة تشغيل الجهاز - يبدأ تلقائياً
5. ✅ Force Stop - ينتظر FCM Wake-up
6. ✅ السائق واقف - يحفظ كل 5 دقائق
7. ✅ السائق يتحرك - يحفظ كل دقيقة

---

## 📊 المراقبة

### 1. Firebase Console

**Functions Logs:**
```
https://console.firebase.google.com/project/taxi-management-system-d8210/functions/logs
```

**Firestore Data:**
```
https://console.firebase.google.com/project/taxi-management-system-d8210/firestore/data
```

**Collections للمراقبة:**
- `drivers` - حالة السائقين الحالية
- `locationHistory` - سجل المواقع
- `alerts` - التنبيهات
- `fcm_logs` - سجل FCM pushes
- `tracking_events` - أحداث التتبع
- `daily_stats` - إحصائيات يومية

### 2. Command Line

**عرض logs مباشرة:**
```bash
firebase functions:log --follow
```

**عرض logs لـ function معينة:**
```bash
firebase functions:log --only monitorDrivers
```

**عرض logs آخر ساعة:**
```bash
firebase functions:log --since 1h
```

---

## 🔧 استكشاف الأخطاء

### مشكلة: Cloud Functions لا تعمل

**الحل:**
```bash
# 1. تحقق من الـ APIs
firebase projects:list
firebase use taxi-management-system-d8210

# 2. تحقق من الـ billing
# افتح https://console.firebase.google.com/project/taxi-management-system-d8210/usage

# 3. أعد deploy
firebase deploy --only functions --force
```

### مشكلة: FCM لا يصل

**الحل:**
```bash
# 1. تحقق من FCM tokens في Firestore
# افتح drivers collection وتأكد من وجود fcmToken

# 2. تحقق من fcm_logs
# ابحث عن errors

# 3. اختبر FCM يدوياً
# استخدم Firebase Console > Cloud Messaging
```

### مشكلة: كثرة التوقفات

**الحل:**
```bash
# 1. تحقق من الكود
# تأكد من أن shouldSaveToHistory تستخدم currentSpeed

# 2. تحقق من logs
# ابحث عن "Driver stopped" و "Driver moving"

# 3. تحقق من البيانات
# افتح locationHistory وشوف الـ timestamps
```

---

## 📝 Checklist قبل الإنتاج

### Cloud Functions
- [ ] تم deploy بنجاح
- [ ] monitorDrivers يعمل كل دقيقة
- [ ] FCM pushes تُرسل
- [ ] Logs نظيفة بدون errors

### APK
- [ ] Version code: 5
- [ ] Version name: 2.2.5
- [ ] موقّع بـ keystore
- [ ] مختبر على جهاز حقيقي
- [ ] جميع السيناريوهات تعمل

### Firestore
- [ ] Rules محدثة
- [ ] Indexes محدثة
- [ ] Backup مفعّل

### Monitoring
- [ ] Firebase Console accessible
- [ ] Logs monitoring setup
- [ ] Alerts configured

---

## 🎉 بعد النشر

### 1. إعلام الفريق
```
✅ تم نشر v2.2.5
📱 APK: [رابط التحميل]
☁️ Cloud Functions: Active
📊 Dashboard: [رابط]
```

### 2. المراقبة الأولية (24 ساعة)
- راقب logs كل ساعة
- تحقق من alerts
- تأكد من عدم وجود errors

### 3. جمع Feedback
- اسأل السائقين عن الأداء
- راقب استهلاك البطارية
- تحقق من دقة البيانات

---

## 📞 الدعم

**للمشاكل التقنية:**
- افتح issue في GitHub
- أرسل logs من Firebase Console
- أرفق screenshots إذا لزم الأمر

**للاستفسارات:**
- راجع CHANGELOG.md
- راجع CODE_ANALYSIS_REPORT.md
- راجع INSPECTION_REPORT.md

---

**آخر تحديث:** 29 أكتوبر 2025
**الإصدار:** v2.2.5

