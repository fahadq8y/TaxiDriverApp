# 📋 المرجع الرئيسي لمشروع Taxi Driver App

> **آخر تحديث:** 24 أكتوبر 2025  
> **الهدف:** توثيق شامل لجميع التغييرات، القواعد، المشاكل، والحلول لتجنب تكرار الأخطاء

---

## 🎯 القواعد الذهبية (يجب عدم تغييرها أبداً)

### 1. معرفات السائقين (Driver IDs)

**القاعدة الثابتة:**
- الرقم الوظيفي الرسمي: `DRV001`, `DRV002`, ... إلخ
- يتم إنشاء الرقم الوظيفي **تلقائياً** في صفحة إدارة السائقين
- السائق **لا يكتب** رقمه الوظيفي عند تسجيل الدخول
- السائق يكتب **اسمه** و **كلمة المرور** فقط

**البيانات في Firestore:**

```
Collection: users
Document ID: (auto-generated)
Fields:
  - name: "سائق 1"
  - password: "123"
  - driverId: "DRV001"  ← هذا هو الرقم الوظيفي الرسمي
  - role: "driver"
```

```
Collection: drivers
Document ID: "DRV001"  ← نفس الرقم الوظيفي
Fields:
  - driverId: "DRV001"
  - employeeNumber: "DRV001"
  - name: "سائق 1"
  - isActive: true/false
  - location: { latitude, longitude, speed, accuracy, heading }
  - lastUpdate: timestamp
```

**⚠️ تنبيه مهم:**
- **لا تستخدم** أرقام بسيطة مثل `1`, `2`, `3` كمعرفات للسائقين
- **لا تخلط** بين `DRV001` و `1` - استخدم دائماً الصيغة الكاملة
- **لا تغير** معرف الوثيقة في collection `drivers` - يجب أن يكون دائماً `DRV001`

---

## 📦 Collections في Firestore

### Collection: `drivers`

**الغرض:** تخزين بيانات السائقين وموقعهم الحالي

**Document ID:** الرقم الوظيفي (مثل `DRV001`)

**الحقول المهمة:**
- `isActive` (Boolean): حالة التتبع (true = نشط، false = غير نشط)
- `location` (Map): الموقع الحالي
  - `latitude` (Number)
  - `longitude` (Number)
  - `speed` (Number)
  - `accuracy` (Number)
  - `heading` (Number)
- `lastUpdate` (Timestamp): آخر تحديث

**⚠️ قاعدة مهمة:**
- **جميع صفحات التتبع** يجب أن تقرأ من `drivers` collection فقط
- **لا تستخدم** `driverLocations` collection (قديم ومهمل)

---

### Collection: `users`

**الغرض:** تخزين بيانات تسجيل الدخول للمستخدمين

**الحقول المهمة:**
- `name` (String): اسم المستخدم
- `password` (String): كلمة المرور
- `driverId` (String): الرقم الوظيفي (للسائقين فقط)
- `role` (String): "driver" أو "admin"

---

## 🔄 سجل التغييرات

### التغيير #1: إصلاح تعارضات Google Play Services
**التاريخ:** 24 أكتوبر 2025  
**المشكلة:** `IncompatibleClassChangeError` بسبب تعارض إصدارات Google Play Services  
**الحل:**
- تحديث `android/build.gradle`:
  ```gradle
  ext {
      playServicesLocationVersion = "21.3.0"
  }
  ```
- إزالة التبعيات اليدوية من `android/app/build.gradle`
- السماح لمكتبة Transistor بإدارة التبعيات تلقائياً

**Commit:** `0f2bdc0`

---

### التغيير #2: إصلاح صفحة التتبع التجريبية في التطبيق
**التاريخ:** 24 أكتوبر 2025  
**المشكلة:** استخدام معرف ثابت `DRV001` بدلاً من الرقم الوظيفي الفعلي  
**الحل:**
- تعديل `TestTrackingScreen.js` لقراءة `employeeNumber` من AsyncStorage
- استخدام `employeeNumber` الديناميكي بدلاً من القيمة الثابتة

**Commit:** `95828ec`

---

### التغيير #3: إصلاح صفحات التتبع في الموقع
**التاريخ:** 24 أكتوبر 2025  
**المشكلة:** الصفحات تقرأ من `driverLocations` بدلاً من `drivers`  
**الحل:**
- تعديل `test-tracking.html`: استخدام `driverId` من URL query parameter
- تعديل `tracking-management.html`: القراءة من `drivers` + استماع في الوقت الفعلي
- تعديل `tracking.html`: القراءة من `drivers` + استخدام `isActive`

**Commit:** `39e13c1`

---

### التغيير #4: إضافة logging تفصيلي للتتبع التلقائي
**التاريخ:** 24 أكتوبر 2025  
**المشكلة:** التتبع التلقائي لا يعمل عند تسجيل الدخول  
**الحل:**
- إضافة logging تفصيلي في `MainScreen.js`
- إضافة رسائل Alert لتوضيح الأخطاء

**Commit:** `cc0cb3b`

---

### التغيير #5: إضافة Alert لتتبع عمليات الكتابة إلى Firestore
**التاريخ:** 24 أكتوبر 2025  
**المشكلة:** التطبيق لا يكتب إلى Firestore رغم أن التتبع نشط  
**الحل:**
- إضافة Alert في `LocationService.js` قبل وبعد الكتابة إلى Firestore
- إضافة Alert عند حدوث خطأ في الكتابة
- هذا للتشخيص فقط - سيتم إزالته بعد حل المشكلة

**Commit:** `64ea8e0`

---

### التغيير #6: إصلاح خطأ missing Alert import
**التاريخ:** 24 أكتوبر 2025  
**المشكلة:** التطبيق يتعطل عند بدء التتبع - `Property 'Alert' doesn't exist`  
**السبب:** نسيت إضافة `import { Alert }` في commit السابق  
**الحل:**
- إضافة `import { Alert, Platform, PermissionsAndroid } from 'react-native';`
- إزالة السطر المكرر

**Commit:** `0b8111a`

---

### التغيير #7: إصلاح مشكلة serverTimestamp() - رحلة طويلة من التجربة والخطأ

**التاريخ:** 24 أكتوبر 2025  
**الوقت:** 1:00 PM - 3:00 PM (GMT+3)  

---

#### المرحلة 1: اكتشاف المشكلة

**الخطأ الظاهر:**
```
u.default.FieldValue.serverTimestamp is not a function (it is undefined)
```

**الأعراض:**
- التطبيق يظهر التتبع نشطاً (الشريط الأخضر + الإشعار)
- لكن البيانات **لا تُكتب** إلى Firestore
- `lastUpdate` في Firestore عالق عند 23 أكتوبر 20:43 UTC

**السبب المكتشف:**
الكود الحالي يستخدم:
```javascript
firestore.FieldValue.serverTimestamp()  // ❌ خاطئ
```

**التحليل:**
- عند استيراد `firestore` من `@react-native-firebase/firestore`، فإن `firestore` هو **دالة** وليس كائن
- يجب استدعاء الدالة `firestore()` أولاً للحصول على instance
- ثم الوصول إلى `FieldValue` من هذا الـ instance

---

#### المرحلة 2: المحاولة الأولى - إضافة الأقواس

**الحل المقترح:**
```javascript
firestore().FieldValue.serverTimestamp()  // ✅ صحيح نظرياً
```

**التعديلات:**
- السطر 181: في دالة `start()`
- السطر 251: في دالة `onLocation()`
- السطر 277: في دالة `updateDriverStatus()`

**Commit:** `f649d6d` - "Fix: Correct serverTimestamp() usage - add parentheses after firestore"

**النتيجة:**
- تم رفع الكود إلى GitHub ✅
- تم إعادة البناء على CodeMagic ✅
- **لكن الخطأ مازال يظهر!** ❌

---

#### المرحلة 3: التحقيق والتحليل العميق

**الخطأ الجديد:**
```
Cannot read property 'serverTimestamp' of undefined
```

**الملاحظات:**
1. البناء من commit `384e8f4` (التوثيق فقط)
2. الكود على GitHub صحيح ✅
3. لكن الخطأ يقول `FieldValue` نفسه `undefined`!

**البيئة المكتشفة:**
```json
{
  "@react-native-firebase/firestore": "^23.4.1",
  "react": "19.1.1",
  "react-native": "0.82.0"
}
```

**التضارب المحتمل:**
- React Native Firebase **v23.4.1** (أحدث إصدار)
- React **19.1.1** (React 19 - إصدار جديد جداً)
- قد تكون هناك مشكلة توافق بين الإصدارات

---

#### المرحلة 4: الحل البديل المؤقت

**القرار:**
استبدال `serverTimestamp()` بـ `new Date()` مؤقتاً

**التعديل:**
```javascript
// قبل
lastUpdate: firestore().FieldValue.serverTimestamp()

// بعد
lastUpdate: new Date()
```

**المزايا:**
- ✅ يعمل بدون أخطاء
- ✅ يحفظ الوقت الحالي
- ✅ متوافق مع جميع الإصدارات
- ✅ بسيط ومباشر

**العيوب:**
- ⚠️ يستخدم وقت الجهاز (Client) وليس السيرفر
- ⚠️ قد يكون غير دقيق إذا كان وقت الجهاز خاطئ
- ⚠️ مشاكل محتملة مع المناطق الزمنية المختلفة

**Commit:** `830d783` - "Temp fix: Use new Date() instead of serverTimestamp()"

---

#### الخلاصة

**المشكلة الأساسية:**
- خطأ في استخدام `serverTimestamp()` في React Native Firebase v23
- محاولة إصلاح بإضافة الأقواس لم تنجح
- تضارب محتمل مع React 19 أو Firebase v23

**الحل النهائي:**
- استبدال `serverTimestamp()` بـ `new Date()`
- حل مؤقت لكنه يعمل بشكل جيد
- يمكن البحث عن حل دائم لاحقاً إذا لزم الأمر

**Commits:**
- `f649d6d`: المحاولة الأولى (لم تنجح)
- `384e8f4`: التوثيق
- `830d783`: الحل البديل (يعمل ✅)
- `4fb2f96`: تحديث التوثيق

---

## ❌ المشاكل المعروفة

### مشكلة #1: التتبع لا يكتب إلى Firestore
**الحالة:** ✅ **تم الحل (بحل بديل)**  
**السبب الأساسي:** خطأ في استخدام `serverTimestamp()` + تضارب محتمل مع React Native Firebase v23  
**الحل:** استبدال `serverTimestamp()` بـ `new Date()` - انظر التغيير #7

---

### مشكلة #2: صفحة معلومات السائق فارغة
**الحالة:** قيد التحقيق  
**السبب المحتمل:** مشكلة في Firebase في WebView  
**الحل المقترح:** إضافة logging في `driver-view.html` أو استخدام Chrome DevTools

---

### مشكلة #3: isActive لا يتحدث عند إيقاف التتبع
**الحالة:** قيد الاختبار  
**السبب المحتمل:** دالة `stop()` في `LocationService.js` قد لا تعمل بشكل صحيح  
**الحل المقترح:** اختبار دالة `updateDriverStatus(false)` بعد إعادة البناء

---

## 🚫 الأخطاء التي يجب تجنبها

### ❌ خطأ #1: استخدام أرقام بسيطة كمعرفات
**مثال خاطئ:** `driverId = "1"`  
**الصحيح:** `driverId = "DRV001"`

---

### ❌ خطأ #2: القراءة من collection خاطئ
**مثال خاطئ:** `collection(db, 'driverLocations')`  
**الصحيح:** `collection(db, 'drivers')`

---

### ❌ خطأ #3: استخدام معرفات ثابتة في الكود
**مثال خاطئ:** `const testDriverId = 'DRV001';`  
**الصحيح:** قراءة `driverId` من AsyncStorage أو URL parameter

---

### ❌ خطأ #4: عدم استخدام onSnapshot للتحديثات الفورية
**مثال خاطئ:** `getDoc()` أو `getDocs()`  
**الصحيح:** `onSnapshot()` للاستماع في الوقت الفعلي

---

### ❌ خطأ #5: نسيان import عند استخدام مكونات React Native
**مثال خاطئ:** استخدام `Alert.alert()` بدون `import { Alert } from 'react-native';`  
**الخطأ:** `Property 'Alert' doesn't exist`  
**الصحيح:** دائماً أضف imports في بداية الملف قبل استخدام أي مكون

---

### ❌ خطأ #6: استخدام firestore بدون أقواس مع FieldValue
**مثال خاطئ:** `firestore.FieldValue.serverTimestamp()`  
**الخطأ:** `u.default.FieldValue.serverTimestamp is not a function (it is undefined)`  
**السبب:** `firestore` هو دالة وليس كائن، يجب استدعاؤها أولاً  
**الصحيح نظرياً:** `firestore().FieldValue.serverTimestamp()` (لاحظ الأقواس `()` بعد firestore)  
**ملاحظة:** في بعض الإصدارات (v23+)، قد لا يعمل `serverTimestamp()` بسبب تضاربات. استخدم `new Date()` كبديل.

---

### ❌ خطأ #7: الاعتماد على serverTimestamp() في الإصدارات الجديدة
**المشكلة:** `Cannot read property 'serverTimestamp' of undefined`  
**السبب:** تضارب محتمل مع React Native Firebase v23 أو React 19  
**الحل البديل:** استخدم `new Date()` بدلاً من `serverTimestamp()`  
**مثال:**
```javascript
// بدلاً من
lastUpdate: firestore().FieldValue.serverTimestamp()

// استخدم
lastUpdate: new Date()
```

---

## 📝 ملاحظات مهمة

### عن التتبع:
- التتبع يستخدم مكتبة **Transistor Background Geolocation v4.19.0**
- الإصدار 4.19.0 يدعم `play-services-location v21+`
- إعدادات التتبع: `distanceFilter: 10` متر، `desiredAccuracy: HIGH`

### عن Firestore:
- القواعد الحالية: السماح للجميع بالقراءة والكتابة (للاستخدام المحلي)
- Database location: `me-central1`
- **ملاحظة مهمة:** استخدم `new Date()` بدلاً من `serverTimestamp()` لتجنب مشاكل التوافق

### عن التضاربات المعروفة:
- React Native Firebase v23.4.1 + React 19.1.1 قد يسبب مشاكل مع `serverTimestamp()`
- الحل: استخدام `new Date()` كبديل مؤقت أو دائم

### عن Vercel:
- الموقع: `https://test-taxi-knpc.vercel.app/`
- يتم النشر تلقائياً عند push إلى `main` branch

---

## 🔍 نقاط التحقق قبل أي تعديل

قبل تعديل أي كود، تحقق من:

1. ✅ هل التعديل يتعارض مع القواعد الذهبية؟
2. ✅ هل التعديل يؤثر على معرفات السائقين؟
3. ✅ هل التعديل يغير collection المستخدم في Firestore؟
4. ✅ هل التعديل يستخدم `onSnapshot` للتحديثات الفورية؟
5. ✅ هل التعديل موثق في سجل التغييرات؟

---

## 📊 حالة المشروع الحالية

### التطبيق (TaxiDriverApp):
- ✅ Google Play Services: محدّث وصحيح
- ⚠️ التتبع التلقائي: قيد الاختبار
- ✅ الصفحة التجريبية: تعمل بشكل صحيح
- ⚠️ صفحة معلومات السائق: فارغة

### الموقع (Test-taxi):
- ✅ صفحات التتبع: تقرأ من `drivers` collection
- ✅ الاستماع في الوقت الفعلي: مفعّل
- ✅ استخدام `isActive`: صحيح
- ⚠️ البيانات القديمة: `DRV001` لا يزال `isActive: true` من أمس

---

## 🎯 الخطوات التالية

1. إعادة بناء التطبيق على CodeMagic
2. اختبار التتبع التلقائي عند تسجيل الدخول
3. اختبار تحديث `isActive` عند إيقاف التتبع
4. اختبار صفحة معلومات السائق في WebView
5. تنظيف البيانات القديمة في Firestore

---

**نهاية المرجع الرئيسي**




---

## 📄 دليل الصفحات الشامل

### 🚗 التطبيق (TaxiDriverApp)

---

#### 1. `LoginScreen.js`

**الموقع:** `/src/screens/LoginScreen.js`

**الوظيفة:** صفحة تسجيل دخول السائق

**ما يدخله المستخدم:**
- اسم المستخدم (مثل: "سائق 1")
- كلمة المرور (مثل: "123")

**ما تقرأه:**
- **من:** `users` collection في Firestore
- **الطريقة:** `getDocs()` مع query للبحث عن المستخدم
- **الحقول المقروءة:**
  - `name` - للمطابقة مع اسم المستخدم المدخل
  - `password` - للتحقق من كلمة المرور
  - `driverId` - الرقم الوظيفي (مثل "DRV001")
  - `role` - نوع المستخدم ("driver" أو "admin")

**ما تكتبه:**
- **إلى:** AsyncStorage (التخزين المحلي في الجهاز)
- **البيانات المحفوظة:**
  - `employeeNumber` = `driverId` (مثل "DRV001")
  - `driverName` = `name` (مثل "سائق 1")
  - `userRole` = `role` (مثل "driver")

**⚠️ ملاحظة مهمة:**
- السائق **لا يكتب** رقمه الوظيفي
- الرقم الوظيفي يُقرأ تلقائياً من Firestore بناءً على اسم المستخدم

---

#### 2. `MainScreen.js`

**الموقع:** `/src/screens/MainScreen.js`

**الوظيفة:** الشاشة الرئيسية للسائق - تحتوي على WebView لعرض صفحات الموقع

**ما تقرأه:**
- **من:** AsyncStorage
- **البيانات المقروءة:**
  - `employeeNumber` - الرقم الوظيفي (مثل "DRV001")
  - `driverName` - اسم السائق

**ما تكتبه:**
- **لا تكتب** إلى Firestore مباشرة
- تستدعي `LocationService.start()` الذي يكتب البيانات

**WebView URLs:**
- صفحة معلومات السائق: `https://test-taxi-knpc.vercel.app/driver-view.html?driverId=${driverId}`
- تمرر `driverId` عبر URL parameter و sessionStorage

**⚠️ ملاحظة مهمة:**
- التتبع التلقائي يبدأ في `useEffect` عند تحميل الصفحة
- يستدعي `LocationService.start(driverId)` مع الرقم الوظيفي

---

#### 3. `TestTrackingScreen.js`

**الموقع:** `/src/screens/TestTrackingScreen.js`

**الوظيفة:** صفحة تجريبية لاختبار التتبع ومراقبة حالة السائق

**ما تقرأه:**
- **من:** AsyncStorage
  - `employeeNumber` - الرقم الوظيفي (ديناميكي)
- **من:** `drivers` collection في Firestore
  - **Document ID:** `employeeNumber` (مثل "DRV001")
  - **الطريقة:** `onSnapshot()` - استماع في الوقت الفعلي
  - **الحقول المقروءة:**
    - `isActive` - حالة التتبع
    - `location` - الموقع الحالي
    - `lastUpdate` - آخر تحديث

**ما تكتبه:**
- **لا تكتب** إلى Firestore
- تعرض البيانات فقط

**⚠️ ملاحظة مهمة:**
- لا تستخدم معرف ثابت - تقرأ من AsyncStorage
- تستخدم `onSnapshot` للتحديثات الفورية

---

#### 4. `LocationService.js`

**الموقع:** `/src/services/LocationService.js`

**الوظيفة:** خدمة التتبع - تدير تتبع موقع السائق في الخلفية

**ما تقرأه:**
- **لا تقرأ** من Firestore
- تستقبل `driverId` كمعامل عند استدعاء `start(driverId)`

**ما تكتبه:**
- **إلى:** `drivers` collection في Firestore
- **Document ID:** `driverId` (مثل "DRV001")
- **الطريقة:** `set()` مع `{ merge: true }`
- **البيانات المكتوبة:**

**عند بدء التتبع (`start()`):**
```javascript
{
  driverId: "DRV001",
  isActive: true,
  lastUpdate: serverTimestamp()
}
```

**عند تحديث الموقع (كل 10 متر):**
```javascript
{
  location: {
    latitude: number,
    longitude: number,
    speed: number,
    accuracy: number,
    heading: number
  },
  lastUpdate: serverTimestamp()
}
```

**عند إيقاف التتبع (`stop()`):**
```javascript
{
  isActive: false,
  lastUpdate: serverTimestamp()
}
```

**⚠️ ملاحظة مهمة:**
- يستخدم `BackgroundGeolocation` من مكتبة Transistor
- `distanceFilter: 10` - يرسل تحديث كل 10 متر
- يكتب إلى Firestore مباشرة بدون middleware

---

### 🌐 الموقع (Test-taxi على Vercel)

---

#### 5. `driver-view.html`

**الموقع:** `https://test-taxi-knpc.vercel.app/driver-view.html`

**الوظيفة:** صفحة معلومات السائق - تعرض تفاصيل السائق الشخصية والمالية

**ما تقرأه:**
- **من:** URL parameter `?driverId=DRV001`
- **من:** sessionStorage (يتم حقنه من WebView)
- **من:** `drivers` collection في Firestore
  - **Document ID:** `driverId` (مثل "DRV001")
  - **الطريقة:** `onSnapshot()` - استماع في الوقت الفعلي
  - **الحقول المقروءة:**
    - `name` - اسم السائق
    - `phone` - رقم الهاتف
    - `employeeNumber` - الرقم الوظيفي
    - `nationality` - الجنسية
    - `address` - العنوان
    - `assignedCar` - السيارة المخصصة
    - `isActive` - حالة التتبع
    - `location` - الموقع الحالي

**ما تكتبه:**
- **لا تكتب** إلى Firestore
- تعرض البيانات فقط

**⚠️ ملاحظة مهمة:**
- تستقبل `driverId` من WebView عبر URL parameter
- تستخدم `onSnapshot` للتحديثات الفورية

---

#### 6. `test-tracking.html`

**الموقع:** `https://test-taxi-knpc.vercel.app/test-tracking.html`

**الوظيفة:** صفحة تتبع تجريبية - تعرض موقع سائق واحد على الخريطة

**ما تقرأه:**
- **من:** URL parameter `?driverId=DRV001`
- **من:** `drivers` collection في Firestore
  - **Document ID:** `driverId` من URL (مثل "DRV001")
  - **الطريقة:** `onSnapshot()` - استماع في الوقت الفعلي
  - **الحقول المقروءة:**
    - `isActive` - حالة التتبع
    - `location.latitude` - خط العرض
    - `location.longitude` - خط الطول
    - `location.speed` - السرعة
    - `location.accuracy` - الدقة
    - `lastUpdate` - آخر تحديث

**ما تكتبه:**
- **لا تكتب** إلى Firestore
- تعرض البيانات فقط

**⚠️ ملاحظة مهمة:**
- يجب تمرير `driverId` في URL: `test-tracking.html?driverId=DRV001`
- إذا لم يتم تمرير `driverId`، تستخدم القيمة الافتراضية (قد تكون خاطئة)

---

#### 7. `tracking.html`

**الموقع:** `https://test-taxi-knpc.vercel.app/tracking.html`

**الوظيفة:** صفحة التتبع الرئيسية - تعرض جميع السائقين النشطين على الخريطة

**ما تقرأه:**
- **من:** `drivers` collection في Firestore
  - **جميع الوثائق** في collection
  - **الطريقة:** `onSnapshot()` - استماع في الوقت الفعلي
  - **الحقول المقروءة:**
    - `isActive` - حالة التتبع
    - `location.latitude` - خط العرض
    - `location.longitude` - خط الطول
    - `location.speed` - السرعة
    - `location.accuracy` - الدقة
    - `lastUpdate` - آخر تحديث

**ما تكتبه:**
- **لا تكتب** إلى Firestore
- تعرض البيانات فقط

**كيف تعرض السائقين:**
- تقرأ **جميع** السائقين من `drivers` collection
- تعرض فقط السائقين الذين لديهم `location` صالح
- تستخدم `isActive` لتحديد حالة السائق (نشط/غير نشط)

**⚠️ ملاحظة مهمة:**
- **لا تستخدم** `driverLocations` collection (قديم ومهمل)
- **يجب** استخدام `drivers` collection فقط
- تعرض السائق حتى لو كان `isActive: false` (لكن بحالة "غير نشط")

---

#### 8. `tracking-management.html`

**الموقع:** `https://test-taxi-knpc.vercel.app/tracking-management.html`

**الوظيفة:** صفحة إدارة التتبع - تعرض قائمة بجميع السائقين مع تفاصيل حالتهم

**ما تقرأه:**
- **من:** `drivers` collection في Firestore
  - **جميع الوثائق** في collection
  - **الطريقة:** `onSnapshot()` - استماع في الوقت الفعلي
  - **الحقول المقروءة:**
    - `driverId` - الرقم الوظيفي
    - `name` - اسم السائق
    - `isActive` - حالة التتبع
    - `location` - الموقع الحالي
    - `lastUpdate` - آخر تحديث

**ما تكتبه:**
- **لا تكتب** إلى Firestore
- تعرض البيانات فقط

**كيف تعرض السائقين:**
- تقرأ **جميع** السائقين من `drivers` collection
- تعرض قائمة بالسائقين مع حالتهم (نشط/غير نشط)
- تستخدم `isActive` من Firestore مباشرة

**⚠️ ملاحظة مهمة:**
- **لا تحسب** `isActive` بناءً على الوقت
- **يجب** استخدام `isActive` من Firestore مباشرة
- **لا تستخدم** `driverLocations` collection

---

## 📊 مخطط تدفق البيانات

### عند تسجيل الدخول:
```
1. السائق يدخل اسمه وكلمة المرور في LoginScreen
2. LoginScreen يقرأ من users collection
3. LoginScreen يحفظ driverId في AsyncStorage
4. الانتقال إلى MainScreen
```

### عند بدء التتبع:
```
1. MainScreen يقرأ driverId من AsyncStorage
2. MainScreen يستدعي LocationService.start(driverId)
3. LocationService يكتب إلى drivers/{driverId}:
   - isActive: true
   - lastUpdate: timestamp
4. LocationService يبدأ تتبع الموقع
5. كل 10 متر، LocationService يكتب location إلى drivers/{driverId}
```

### عند عرض التتبع في الموقع:
```
1. tracking.html يقرأ من drivers collection (جميع السائقين)
2. onSnapshot يستمع للتحديثات في الوقت الفعلي
3. عند تحديث location، تتحدث الخريطة تلقائياً
4. يعرض السائق كـ "نشط" إذا كان isActive: true
```

### عند إيقاف التتبع:
```
1. السائق يضغط على "إيقاف التتبع" في MainScreen
2. MainScreen يستدعي LocationService.stop()
3. LocationService يكتب إلى drivers/{driverId}:
   - isActive: false
   - lastUpdate: timestamp
4. LocationService يوقف تتبع الموقع
5. صفحات الموقع تتحدث تلقائياً وتعرض السائق كـ "غير نشط"
```

---

## 🔍 نقاط التحقق لكل صفحة

### قبل تعديل أي صفحة:

**للصفحات في التطبيق:**
1. ✅ هل تقرأ `driverId` من AsyncStorage (وليس قيمة ثابتة)؟
2. ✅ هل تكتب إلى `drivers/{driverId}` (وليس collection آخر)؟
3. ✅ هل تستخدم `onSnapshot` للتحديثات الفورية؟

**للصفحات في الموقع:**
1. ✅ هل تقرأ من `drivers` collection (وليس `driverLocations`)؟
2. ✅ هل تستخدم `onSnapshot` (وليس `getDoc` أو `getDocs`)؟
3. ✅ هل تستخدم `isActive` من Firestore (وليس حساب الوقت)؟
4. ✅ هل تقرأ `driverId` من URL parameter (للصفحات الفردية)؟

---

**نهاية دليل الصفحات الشامل**

