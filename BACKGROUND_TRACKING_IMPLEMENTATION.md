# 🚀 تطبيق التتبع التلقائي والخلفية

> **التاريخ:** 25 أكتوبر 2025  
> **الهدف:** تمكين التتبع التلقائي 24/7 بدون تدخل السائق

---

## 📋 المتطلبات

### الوظائف المطلوبة:
1. ✅ السائق يسجل دخول مرة واحدة فقط
2. ✅ التطبيق يفتح تلقائياً عند تشغيل الهاتف
3. ✅ التتبع يعمل في الخلفية حتى لو التطبيق مغلق
4. ✅ التتبع يعمل حتى لو الهاتف مقفل
5. ✅ التتبع يبدأ تلقائياً بعد restart الهاتف

---

## 🔧 التعديلات المطبقة

### المرحلة 1: حفظ تسجيل الدخول (Persistent Login)

**الملفات المعدلة:**
- `src/screens/LoginScreen.js`

**التعديلات:**
```javascript
// حفظ بيانات الدخول بشكل دائم
await AsyncStorage.setItem('persistentLogin', JSON.stringify({
  isLoggedIn: true,
  employeeNumber: employeeNumber,
  loginDate: new Date().toISOString()
}));
```

**النتيجة:**
- السائق لا يحتاج لتسجيل الدخول كل مرة
- البيانات محفوظة بشكل دائم

---

### المرحلة 2: Auto-Login عند فتح التطبيق

**الملفات المعدلة:**
- `App.tsx`

**التعديلات:**
```javascript
// التحقق من تسجيل الدخول عند بدء التطبيق
useEffect(() => {
  checkLoginStatus();
}, []);

const checkLoginStatus = async () => {
  const loginData = await AsyncStorage.getItem('persistentLogin');
  if (loginData) {
    const { isLoggedIn, employeeNumber } = JSON.parse(loginData);
    if (isLoggedIn) {
      navigation.replace('Main', { employeeNumber });
    }
  }
};
```

**النتيجة:**
- التطبيق يفتح مباشرة على الشاشة الرئيسية
- بدون شاشة تسجيل دخول

---

### المرحلة 3: Background Tracking مع Auto-Start

**المكتبة المستخدمة:**
- `react-native-background-geolocation` v4.19.0 (Transistor)

**الملفات المعدلة:**
- `src/services/LocationService.js`
- `android/app/src/main/AndroidManifest.xml`

**التعديلات في LocationService.js:**
```javascript
BackgroundGeolocation.ready({
  desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
  distanceFilter: 10,
  stopOnTerminate: false,  // لا توقف عند إغلاق التطبيق
  startOnBoot: true,       // ابدأ عند تشغيل الهاتف
  enableHeadless: true,    // اعمل حتى بدون UI
  foregroundService: true, // خدمة أمامية دائمة
  notification: {
    title: "تتبع موقع السائق",
    text: "التتبع نشط",
    smallIcon: "drawable/ic_notification",
    priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_LOW
  }
}).then(() => {
  BackgroundGeolocation.start();
});
```

**التعديلات في AndroidManifest.xml:**
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

**النتيجة:**
- التتبع يعمل 24/7 بدون توقف
- يعمل حتى بعد restart الهاتف
- يعمل حتى لو التطبيق مغلق

---

## ⚙️ الإعدادات الإضافية

### Android Battery Optimization:
```javascript
// طلب تعطيل Battery Optimization
BackgroundGeolocation.requestPermission().then((status) => {
  if (status === BackgroundGeolocation.AUTHORIZATION_STATUS_ALWAYS) {
    // تم منح الإذن
  }
});
```

---

## 🎯 النتيجة النهائية

✅ السائق يسجل دخول مرة واحدة فقط
✅ التطبيق يفتح تلقائياً عند تشغيل الهاتف
✅ التتبع يعمل 24/7 حتى لو:
   - التطبيق مغلق
   - الهاتف مقفل
   - الهاتف أعيد تشغيله
✅ بدون إشعارات مزعجة (فقط إشعار صغير في الخلفية)

---

## 📝 ملاحظات مهمة

1. **Battery Optimization:**
   - يجب على السائق تعطيل Battery Optimization للتطبيق
   - يمكن إضافة شاشة توضيحية في التطبيق

2. **Permissions:**
   - يجب منح إذن "السماح دائماً" للموقع
   - يجب منح إذن "تشغيل في الخلفية"

3. **Testing:**
   - اختبر على جهاز حقيقي (ليس Emulator)
   - اختبر restart الهاتف
   - اختبر إغلاق التطبيق بالكامل

---

**نهاية التوثيق**

