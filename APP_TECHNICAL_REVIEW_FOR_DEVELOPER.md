# 🕵️‍♂️ تقرير فني شامل لتطبيق السائق (TaxiDriverApp)

## 📅 تاريخ المراجعة: 28 أكتوبر 2025

## 👨‍💻 موجه إلى: المبرمج المحترف

---

## 🎯 **الملخص التنفيذي (Executive Summary)**

التطبيق مصمم لتتبع موقع السائقين في الخلفية بشكل مستمر. تم تطبيق حلول متقدمة لضمان استمرارية التتبع حتى عند إغلاق التطبيق أو إعادة تشغيل الجهاز. الكود بشكل عام جيد ومنظم، لكن هناك **مشكلة منطقية حرجة** في `HeadlessTask` تؤدي إلى حفظ غير فعال للهيستوري عند إغلاق التطبيق.

| المكون | الحالة | المشكلة الرئيسية |
|---|---|---|
| **التتبع (التطبيق مفتوح)** | ✅ **ممتاز** | لا توجد مشاكل |
| **التتبع (التطبيق في الخلفية)** | ✅ **ممتاز** | لا توجد مشاكل |
| **التتبع (التطبيق مغلق)** | ⚠️ **حرج** | `HeadlessTask` يحفظ كل نقطة في الهيستوري |
| **الاستمرارية (Persistence)** | ✅ **ممتاز** | `Foreground Service`, `Watchdog`, `Persistent Service` |

**التوصية:** إصلاح منطق `shouldSaveToHistory` في `index.js` باستخدام `AsyncStorage` لتخزين حالة الحفظ الأخيرة بشكل دائم.

---

## 1️⃣ **بنية التطبيق (Application Architecture)**

- **اللغة:** React Native
- **التتبع:** `react-native-background-geolocation` (Transistor License)
- **قاعدة البيانات:** Firebase Firestore
- **التخزين المحلي:** `@react-native-async-storage/async-storage`
- **الوحدات الأصلية (Native Modules):**
  - `BatteryOptimizationModule`: لطلب استثناء من تحسين البطارية.
  - `PersistentTrackingService`: لضمان إعادة تشغيل الخدمة.

---

## 2️⃣ **تحليل منطق التتبع (Tracking Logic Analysis)**

### 📍 **أولاً: التتبع عندما يكون التطبيق نشطاً (Foreground/Background)**

- **الملف المسؤول:** `src/services/LocationService.js`
- **المنطق:**
  1.  `configure()`: إعداد `BackgroundGeolocation` مع إعدادات متقدمة (انظر الملحق أ).
  2.  `onLocation()`: يتم استدعاؤها عند كل تحديث للموقع.
  3.  **حفظ الموقع الحالي:** يتم تحديث `drivers/{driverId}` بآخر موقع.
  4.  **حفظ الهيستوري:** يتم إضافة نقطة جديدة إلى `locationHistory` بناءً على شروط `shouldSaveToHistory()`.

**دالة `shouldSaveToHistory()` (في `LocationService.js`):**
```javascript
shouldSaveToHistory(location) {
  // ... (منطق حساب المسافة والوقت)
  if (timeDiff >= 60000 || distance >= 50) {
    return true;
  }
  return false;
}
```

- **التقييم:** ✅ **ممتاز**. هذا المنطق فعال ويمنع إغراق قاعدة البيانات بنقاط غير ضرورية.

---

### ❌ **ثانياً: المشكلة في التتبع عندما يكون التطبيق مغلقاً (Terminated)**

- **الملف المسؤول:** `index.js`
- **المنطق:** `BackgroundGeolocation.registerHeadlessTask(HeadlessTask)`

**الكود الخاطئ في `index.js`:**
```javascript
// Line 15-16: متغيرات محلية يتم إعادة تعيينها في كل مرة!
let lastHistorySaveTime = null;
let lastHistorySaveLocation = null;

// Line 35: دالة shouldSaveToHistory تعتمد على المتغيرات المحلية
const shouldSaveToHistory = (location) => {
  // ...
  // Line 41: هذا الشرط يكون صحيحاً دائماً عند بدء HeadlessTask
  if (!lastHistorySaveTime || !lastHistorySaveLocation) {
    return true;
  }
  // ...
};

// Line 63: HeadlessTask
const HeadlessTask = async (event) => {
  // ...
  // Line 103: هذا الشرط يكون صحيحاً دائماً!
  if (shouldSaveToHistory(location)) {
    // يحفظ كل نقطة في الهيستوري!
    await firestore().collection("locationHistory").add({ ... });
  }
};
```

**شرح المشكلة:**
1.  عندما يقوم نظام التشغيل بتشغيل `HeadlessTask`، يتم تنفيذ `index.js` كسكريبت مستقل.
2.  المتغيرات `lastHistorySaveTime` و `lastHistorySaveLocation` تكون دائماً `null` في بداية كل `HeadlessTask`.
3.  نتيجة لذلك، `shouldSaveToHistory()` تعيد `true` **لكل تحديث موقع**.
4.  هذا يؤدي إلى حفظ **كل نقطة تتبع** في `locationHistory`، مما يسبب مشاكل أداء وتكلفة.

---

## 3️⃣ **الحل المقترح (Proposed Solution)**

**يجب استخدام `AsyncStorage` لتخزين `lastHistorySaveTime` و `lastHistorySaveLocation` بشكل دائم.**

**تعديلات مقترحة على `index.js`:**

```javascript
// 1. احذف المتغيرات المحلية (Line 15-16)
// let lastHistorySaveTime = null;
// let lastHistorySaveLocation = null;

// 2. تعديل shouldSaveToHistory لتكون async وتقرأ من AsyncStorage
const shouldSaveToHistory = async (location) => {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  const now = Date.now();

  // اقرأ القيم المحفوظة
  const lastTimeStr = await AsyncStorage.getItem("lastHistorySaveTime");
  const lastLocationStr = await AsyncStorage.getItem("lastHistorySaveLocation");

  if (!lastTimeStr || !lastLocationStr) {
    return true; // أول مرة
  }

  const lastHistorySaveTime = parseInt(lastTimeStr, 10);
  const lastHistorySaveLocation = JSON.parse(lastLocationStr);

  // ... نفس منطق حساب المسافة والوقت
};

// 3. تعديل HeadlessTask لحفظ الحالة في AsyncStorage
const HeadlessTask = async (event) => {
  // ...
  if (shouldSaveToHistory(location)) {
    await firestore().collection("locationHistory").add({ ... });

    // حفظ الحالة الجديدة
    await AsyncStorage.setItem("lastHistorySaveTime", Date.now().toString());
    await AsyncStorage.setItem("lastHistorySaveLocation", JSON.stringify({ latitude: location.coords.latitude, longitude: location.coords.longitude }));
  }
};
```

---

## 4️⃣ **ميزات الاستمرارية المطبقة (Persistence Features)**

التطبيق يحتوي على عدة طبقات لضمان عدم توقف التتبع:

1.  **`Foreground Service`:** (ميزة من `react-native-background-geolocation`) تبقي التطبيق حياً.
2.  **`stopOnTerminate: false`:** تضمن استمرار التتبع حتى عند إغلاق التطبيق.
3.  **`startOnBoot: true`:** تعيد تشغيل التتبع عند إعادة تشغيل الجهاز.
4.  **`BatteryOptimizationModule.java`:** وحدة أصلية لطلب استثناء من تحسين البطارية (Doze mode).
5.  **`TrackingWatchdog.js`:** تايمر يعمل كل دقيقة للتأكد من أن التتبع نشط وإعادة تشغيله إذا لزم الأمر.
6.  **`PersistentTrackingService.java`:** خدمة Android أصلية تضمن إعادة تشغيل نفسها إذا تم قتلها من قبل النظام.
7.  **منع إيقاف التتبع:** تم تعطيل `LocationService.stop()` ومنع إيقافه من WebView.

**التقييم:** ✅ **ممتاز**. هذه الميزات تجعل التطبيق قوياً جداً وموثوقاً.

---

## 5️⃣ **تحليل التوافق مع الواجهة الأمامية (Frontend Compatibility)**

- **`tracking.html` (صفحة التتبع الحالية):**
  - تقرأ من `drivers` collection فقط.
  - مصممة لعرض **الموقع الحالي** للسائقين، وهذا صحيح.
  - **لا توجد مشاكل توافق.**

- **`driver-details.html` (صفحة تفاصيل السائق):**
  - تقرأ من `drivers` (للموقع الحالي) و `locationHistory` (للهيستوري).
  - تقوم بدمج البيانات بذكاء لعرض مسار كامل.
  - **لا توجد مشاكل توافق.**

**الخلاصة:** الواجهة الأمامية متوافقة تماماً مع بنية البيانات في Firebase. المشكلة الوحيدة هي البيانات الزائدة التي تأتي من `HeadlessTask` الخاطئ.

---

## 🚀 **الخطوات التالية (Next Steps)**

1.  **تطبيق الإصلاح:** تعديل `index.js` كما هو مقترح أعلاه.
2.  **بناء APK جديد:** `cd android && ./gradlew assembleRelease`.
3.  **الاختبار:**
    - تثبيت الـ APK الجديد.
    - تشغيل التطبيق وتسجيل الدخول.
    - إغلاق التطبيق تماماً (Force Stop).
    - التحرك بالسيارة لمسافة.
    - فحص `locationHistory` في Firebase للتأكد من أن النقاط يتم حفظها بشكل متقطع (كل دقيقة أو 50 متر) وليس بشكل مستمر.

---

## 📎 **الملحق أ: إعدادات `BackgroundGeolocation`**

(مقتطف من `LocationService.js`)

```javascript
const state = await BackgroundGeolocation.ready({
  // ... (إعدادات أساسية)
  desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
  distanceFilter: 10, // 10 أمتار
  stopOnTerminate: false,
  startOnBoot: true,
  foregroundService: true,
  notification: { ... }, // إشعار شبه مخفي
  headlessTask: true,
  // ... (إعدادات أخرى)
});
```

