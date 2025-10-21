# سجل الإصلاحات - Transistor Background Geolocation

## التاريخ: 22 أكتوبر 2025

### المشاكل التي تم حلها:

#### 1. مشكلة تعطل التطبيق عند الفتح ❌ ✅
**السبب:** استدعاء `LocationService.start()` بدون `driverId` في `App.tsx`

**الحل:**
- تم حذف استدعاء LocationService من `App.tsx`
- الآن يتم بدء الخدمة فقط بعد تسجيل الدخول من `MainScreen.js`
- الملف: `App.tsx`

#### 2. تعارض المكتبات ⚠️ ✅
**السبب:** وجود المكتبة القديمة `@mauron85/react-native-background-geolocation`

**الحل:**
- تم حذف المكتبة القديمة نهائياً
- تم تنظيف `node_modules` وإعادة التثبيت
- الآن فقط مكتبة Transistor موجودة: `react-native-background-geolocation@4.19.0`

#### 3. مشكلة اسم الحزمة (Package Name) ⚠️
**المشكلة الأولى:** 
- تم تغيير اسم الحزمة إلى `com.dp.taxidriver` لكن Firebase مسجل بـ `com.taxidriverapp`
- سبب فشل البناء: `No matching client found for package name 'com.dp.taxidriver'`

**الحل النهائي:**
- تم إرجاع اسم الحزمة إلى `com.taxidriverapp` (الاسم الأصلي)
- يجب تحديث الترخيص في Transistor Dashboard ليطابق `com.taxidriverapp`

---

## التعديلات المطبقة:

### 1. App.tsx ✅
```typescript
// قبل:
useEffect(() => {
  LocationService.start(); // ❌ بدون driverId
  return () => LocationService.stop();
}, []);

// بعد:
// تم حذف useEffect كاملاً ✅
```

### 2. android/app/build.gradle ✅
```gradle
// النهائي (بعد التصحيح):
namespace "com.taxidriverapp"
applicationId "com.taxidriverapp"
```

### 3. package.json ✅
```json
// تم حذف:
"@mauron85/react-native-background-geolocation": "^0.6.3"

// موجود فقط:
"react-native-background-geolocation": "^4.19.0"
```

---

## معلومات الترخيص:

- **اسم الحزمة الصحيح:** `com.taxidriverapp`
- **مفتاح الترخيص:** `6c61f89b598dabe110900e7926bccf8a3f916ebca075a4ee03350712f6d30e83`
- **موقع الترخيص:** `android/app/src/main/AndroidManifest.xml` (السطر 33-35)

⚠️ **مهم جداً:** يجب تحديث الترخيص في Transistor Dashboard:
1. افتح: https://www.transistorsoft.com/shop/customers
2. سجل دخول بحسابك
3. اذهب إلى License Keys
4. عدّل Package Name من `com.dp.taxidriver` إلى `com.taxidriverapp`

---

## الخطوات التالية:

1. ✅ إصلاح مشكلة App crash
2. ✅ حذف المكتبة القديمة
3. ✅ إرجاع اسم الحزمة للأصلي
4. ⏳ **تحديث الترخيص في Transistor Dashboard** (يحتاج المستخدم يسويه)
5. ⏳ رفع التعديلات إلى GitHub
6. ⏳ بناء التطبيق عبر Codemagic
7. ⏳ تثبيت النسخة الجديدة واختبارها

---

## ملاحظات مهمة:

- التطبيق الآن لن يبدأ خدمة التتبع إلا بعد تسجيل الدخول بنجاح ✅
- اسم الحزمة يطابق Firebase (`com.taxidriverapp`) ✅
- تم حذف جميع آثار المكتبة القديمة ✅
- يجب تحديث الترخيص في Transistor ليطابق `com.taxidriverapp` ⚠️

