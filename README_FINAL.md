# TaxiDriverApp - تطبيق تتبع سائقي التاكسي

## نظرة عامة

تطبيق React Native لتتبع موقع سائقي التاكسي في الوقت الفعلي باستخدام Transistor Background Geolocation وFirebase.

## التكوين الحالي (بعد الإصلاحات)

### إصدارات SDK
```gradle
minSdkVersion = 24
compileSdkVersion = 34
targetSdkVersion = 33
```

### التبعيات الرئيسية
```json
{
  "react": "19.1.1",
  "react-native": "0.82.0",
  "@react-navigation/native": "6.1.9",
  "react-native-background-geolocation": "4.19.0",
  "@react-native-firebase/app": "23.4.1"
}
```

## الإصلاحات المطبقة

### ✅ الإصلاح #1: Target SDK
- **المشكلة:** Transistor Geolocation crash
- **الحل:** تخفيض من SDK 36 إلى 33

### ✅ الإصلاح #2: Compile SDK
- **المشكلة:** androidx.core compatibility error
- **الحل:** رفع من SDK 33 إلى 34

### ✅ الإصلاح #3: React Navigation
- **المشكلة:** Crash عند فتح التطبيق
- **الحل:** تخفيض من v7 (alpha) إلى v6 (stable)

### ✅ الإصلاح #4: React Version
- **المشكلة:** npm dependency conflict
- **الحل:** رفع من React 18.3.1 إلى 19.1.1

### ✅ الإصلاح #5: Notification Channel
- **المشكلة:** عدم عمل الإشعارات على Android 8+
- **الحل:** إضافة channelId

## البناء والتشغيل

### المتطلبات
- Node.js >= 20
- Android Studio
- Java JDK 17+

### التثبيت
```bash
npm install
```

### التشغيل
```bash
# Android
npm run android

# iOS
npm run ios
```

## البناء في CodeMagic

التطبيق متصل بـ CodeMagic CI/CD للبناء التلقائي عند كل push إلى main branch.

## Firebase Configuration

- **Project ID:** taxi-management-system-d8210
- **Collections:**
  - `users` - بيانات المستخدمين
  - `drivers` - بيانات السائقين والموقع

## الترخيص

Transistor Background Geolocation مرخص لـ `com.dp.taxidriver`

## الملاحظات المهمة

⚠️ **لا تقم بترقية React Native** بدون التأكد من توافق Transistor Background Geolocation  
⚠️ **استخدم إصدارات stable فقط** من React Navigation  
⚠️ **اختبر دائماً على جهاز حقيقي** وليس المحاكي

## الحالة الحالية

✅ جميع الإصلاحات مطبقة  
✅ الكود مدفوع إلى GitHub  
✅ npm install يعمل بنجاح  
⏳ في انتظار البناء في CodeMagic

## آخر تحديث

**التاريخ:** 24 أكتوبر 2025  
**Commit:** bc06a0c - Fix: Upgrade React to 19.1.1 for React Native 0.82.0 compatibility

