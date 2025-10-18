# تطبيق السائق - Taxi Driver App

تطبيق أندرويد للسائقين في نظام إدارة سيارات الأجرة.

## المميزات

- **تسجيل الدخول**: يستخدم نفس بيانات الاعتماد من نظام إدارة المستخدمين في الموقع
- **عرض WebView**: يعرض صفحة driver-view.html من الموقع
- **تتبع GPS على مدار الساعة**: خدمة تتبع في الخلفية تعمل 24/7 حتى مع قفل الشاشة
- **تحديثات الموقع في الوقت الفعلي**: يرسل موقع السائق إلى Firebase كل 5 ثواني

## البنية التقنية

- **Framework**: React Native CLI (ليس Expo)
- **Platform**: Android فقط
- **Backend**: Firebase (Firestore + Authentication)
- **Build Service**: Codemagic

## المتطلبات

- Node.js >= 20
- React Native CLI
- Android SDK
- JDK 11 أو أحدث

## التثبيت

```bash
# تثبيت الحزم
npm install

# تشغيل على Android
npm run android
```

## البناء

سيتم بناء التطبيق باستخدام Codemagic:
1. دفع الكود إلى GitHub
2. ربط المستودع مع Codemagic
3. إعداد workflow للبناء
4. تنزيل ملف APK

## الصلاحيات

التطبيق يحتاج الصلاحيات التالية:
- `ACCESS_FINE_LOCATION`: للحصول على الموقع الدقيق
- `ACCESS_BACKGROUND_LOCATION`: للتتبع في الخلفية
- `FOREGROUND_SERVICE`: لتشغيل الخدمة في المقدمة
- `WAKE_LOCK`: لمنع النوم أثناء التتبع

## الملفات الرئيسية

- `App.tsx`: نقطة الدخول الرئيسية مع Navigation
- `src/screens/LoginScreen.js`: شاشة تسجيل الدخول
- `src/screens/MainScreen.js`: شاشة WebView الرئيسية
- `src/services/LocationService.js`: خدمة تتبع الموقع في الخلفية
- `src/config/firebase.js`: إعدادات Firebase

## Firebase Configuration

معرف المشروع: `taxi-management-system-d8210`
اسم الحزمة: `com.taxidriverapp`

## الترخيص

خاص - لاستخدام شركة إدارة سيارات الأجرة فقط

