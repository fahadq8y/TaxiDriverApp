# إصلاح مشكلة AppRegistry في تطبيق White Horse Drivers

## المشكلة الأصلية

كان التطبيق يتعطل عند التشغيل مع الخطأ التالي:
```
Invariant Violation: "TaxiDriverApp" has not been registered
```

## السبب الجذري

كان هناك عدم تطابق بين:
- **app.json**: `"name": "WhiteHorseDrivers"`
- **index.js**: يستخدم `import { name as appName } from './app.json'`
- **AppRegistry**: `AppRegistry.registerComponent(appName, () => App)`

عندما تم تغيير الاسم في `app.json` إلى `WhiteHorseDrivers` (بدون مسافات)، أصبح `index.js` يسجل المكون باسم `WhiteHorseDrivers` بينما النظام كان يبحث عن `TaxiDriverApp`.

## الحل المطبق

تم إرجاع `app.json` إلى الاسم الأصلي:

```json
{
  "name": "TaxiDriverApp",
  "displayName": "White Horse Drivers"
}
```

**لماذا هذا الحل؟**

1. **name**: الاسم الداخلي للتطبيق (يستخدم في AppRegistry) - يجب أن يكون ثابتاً
2. **displayName**: اسم العرض الذي يظهر للمستخدم - يمكن تغييره بحرية
3. **strings.xml**: يحتوي على `White Horse Drivers` لاسم التطبيق في Android

## الملفات المعدلة

### 1. app.json
```json
{
  "name": "TaxiDriverApp",           // ← الاسم الداخلي (ثابت)
  "displayName": "White Horse Drivers" // ← اسم العرض (جديد)
}
```

### 2. android/app/src/main/res/values/strings.xml
```xml
<resources>
    <string name="app_name">White Horse Drivers</string>
</resources>
```

### 3. أيقونات التطبيق
تم تحديث جميع الأيقونات في:
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` (48x48)
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` (72x72)
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` (96x96)
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` (144x144)
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` (192x192)
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` (1024x1024)

## النتيجة المتوقعة

✅ **اسم التطبيق**: "White Horse Drivers" (يظهر في قائمة التطبيقات)
✅ **الأيقونة**: حصان أبيض على خلفية زرقاء
✅ **لا يوجد crash**: التطبيق يفتح بنجاح
✅ **Background Tracking**: يعمل في الخلفية ويحفظ في `locationHistory`

## خطوات البناء والاختبار

### 1. بناء APK في Codemagic
1. افتح https://codemagic.io/apps
2. اختر مشروع **TaxiDriverApp**
3. شغّل Build جديد (أو انتظر Auto-build)
4. حمّل APK بعد اكتمال البناء

### 2. اختبار التطبيق
1. ثبّت APK على جهاز Android
2. افتح التطبيق - يجب أن يظهر اسم "White Horse Drivers"
3. سجل دخول بحساب سائق
4. تحقق من عمل التطبيق الأساسي

### 3. اختبار Background Location Tracking
1. افتح التطبيق وسجل دخول
2. **اغلق التطبيق تماماً** (اسحبه من Recent Apps)
3. انتظر 5-10 دقائق
4. افتح Web Dashboard: https://test-taxi-jgaes86fu-knpc.vercel.app/driver-details.html
5. اختر السائق من القائمة
6. **تحقق من Timeline** - يجب أن تظهر نقاط جديدة تم تسجيلها في الخلفية

## تفاصيل Background Tracking

### كيف يعمل؟

التطبيق يستخدم **Headless Task** من `react-native-background-geolocation` لتتبع الموقع حتى عند إغلاق التطبيق.

### متى يحفظ الموقع؟

يحفظ في `locationHistory` collection عندما:
- مرت **دقيقة واحدة** من آخر حفظ، **أو**
- تحرك السائق **50 متر** من آخر موقع محفوظ

### البيانات المحفوظة

```javascript
{
  driverId: "DRV001",
  timestamp: Firestore.Timestamp,
  latitude: 29.3759,
  longitude: 47.9774,
  speed: 45.5,        // km/h
  accuracy: 10.2,     // meters
  heading: 180,       // degrees
  altitude: 50        // meters
}
```

### Firebase Collections

1. **drivers/{driverId}/location** - الموقع الحالي فقط (يتحدث كل ثانية)
2. **locationHistory** - سجل كامل للمواقع (يحفظ كل دقيقة أو 50م)

## Commits المتعلقة

- `334ff71` - إضافة Background Location Tracking + تغيير الاسم والأيقونة
- `bcd60a2` - إصلاح AppRegistry name mismatch

## ملاحظات مهمة

⚠️ **لا تغير `name` في app.json مرة أخرى!**
- استخدم `displayName` فقط لتغيير اسم العرض
- `name` يجب أن يبقى `TaxiDriverApp` دائماً

⚠️ **Background Tracking يحتاج أذونات:**
- Location Permission (Always Allow)
- Battery Optimization (Disabled)
- Notifications (Enabled)

## الدعم الفني

إذا واجهت أي مشاكل:
1. تحقق من Logs في Codemagic
2. تحقق من Firebase Console (locationHistory collection)
3. تحقق من Android Logcat على الجهاز

