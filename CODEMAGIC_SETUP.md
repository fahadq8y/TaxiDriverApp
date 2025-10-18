# دليل إعداد Codemagic لبناء التطبيق

## الخطوات المطلوبة

### 1. إنشاء حساب على Codemagic

1. اذهب إلى [Codemagic.io](https://codemagic.io/)
2. سجل الدخول باستخدام حساب GitHub الخاص بك
3. اختر الخطة المجانية (500 دقيقة بناء شهرياً)

### 2. ربط المستودع

1. من لوحة التحكم في Codemagic، انقر على "Add application"
2. اختر GitHub كمصدر
3. ابحث عن مستودع `TaxiDriverApp`
4. انقر على "Select" لإضافة المستودع

### 3. إعداد Workflow

1. سيتم اكتشاف ملف `codemagic.yaml` تلقائياً
2. اختر workflow: `android-workflow`
3. تأكد من الإعدادات التالية:
   - **Build triggers**: Automatic على branch `main`
   - **Environment**: Android SDK 36
   - **Node version**: 20

### 4. إعداد توقيع التطبيق (اختياري للإصدار الأول)

للإصدار التجريبي الأول، يمكن استخدام debug keystore الافتراضي.

للإصدار النهائي:
1. قم بإنشاء keystore جديد:
   ```bash
   keytool -genkey -v -keystore taxi-driver-release.keystore -alias taxi-driver -keyalg RSA -keysize 2048 -validity 10000
   ```
2. ارفع الـ keystore إلى Codemagic:
   - اذهب إلى Teams → Code signing identities
   - انقر على "Add Android code signing"
   - ارفع ملف keystore
   - أدخل كلمة المرور والـ alias

### 5. بدء البناء

1. انقر على "Start new build"
2. اختر branch: `main`
3. اختر workflow: `android-workflow`
4. انقر على "Start build"

### 6. تنزيل APK

بعد اكتمال البناء (حوالي 10-15 دقيقة):
1. اذهب إلى صفحة البناء
2. في قسم "Artifacts"، ستجد ملف APK
3. انقر على "Download" لتنزيل التطبيق

## ملاحظات مهمة

- **وقت البناء**: عادة يستغرق 10-15 دقيقة
- **الحد الشهري**: 500 دقيقة مجاناً (حوالي 30-50 بناء)
- **حجم APK**: متوقع حوالي 40-60 MB

## استكشاف الأخطاء

### خطأ في تثبيت الحزم
إذا فشل البناء في مرحلة `npm install`:
- تأكد من أن ملف `package.json` موجود وصحيح
- تحقق من سجل الأخطاء في Codemagic

### خطأ في Gradle
إذا فشل البناء في مرحلة Gradle:
- تأكد من أن ملف `google-services.json` موجود
- تحقق من إعدادات Android SDK

### خطأ في Firebase
إذا كان هناك خطأ متعلق بـ Firebase:
- تأكد من أن ملف `google-services.json` صحيح
- تحقق من أن package name في Firebase يطابق `com.taxidriverapp`

## روابط مفيدة

- [Codemagic Documentation](https://docs.codemagic.io/)
- [React Native Build Guide](https://docs.codemagic.io/yaml-quick-start/building-a-react-native-app/)
- [GitHub Repository](https://github.com/fahadq8y/TaxiDriverApp)

## الدعم

في حال واجهت أي مشاكل:
1. راجع سجل البناء في Codemagic
2. تحقق من الإعدادات في ملف `codemagic.yaml`
3. تأكد من أن جميع الملفات المطلوبة موجودة في المستودع

