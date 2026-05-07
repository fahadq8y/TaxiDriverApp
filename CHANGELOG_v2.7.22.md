# v2.7.22 — Per-Point Enrichment

  **Release:** 2026-05-07 | **Codename:** "DNA"

  ## للإدارة
  كل نقطة تتسجّل الحين بمعلوماتها الكاملة:

  | حقل | معنى | فائدة |
  |---|---|---|
  | `appVersion` | إصدار التطبيق | تعرف لو السائق على نسخة قديمة |
  | `source` | `rnbg-fg` / `rnbg-batched` / `headless` | تعرف من أين جت النقطة |
  | `batteryLevel` | بطارية (0-100) | تربط silent death بانخفاض البطارية |
  | `networkType` | `wifi` / `cellular` / `other` | تعرف نوع الإنترنت وقت الـ upload |
  | `networkValidated` | الإنترنت يعمل فعلاً؟ | يفصل بين "متصل" و "بدون نت" |

  ## التغييرات
  - `src/services/LocationService.js`: import NativeModules + helper `enrichLocationPoint(source)` + spread في `locationHistory.add()` و `locationHistoryBatched.add()`
  - `index.js`: import NativeModules + DeviceInfo + helper `enrichLocationPointHeadless(source)` + spread في headless task
  - `package.json`: 2.7.21 → 2.7.22

  ## التوافق
  - لو DiagnosticsModule (v2.7.21) مفقود → networkType ينحذف من النقطة بهدوء
  - النقاط القديمة بدون هالحقول تستمر تشتغل عادي
  - صفحة `driver-diagnostics.html` تعرض هالحقول تلقائياً

  ## نشر
  1. `cd android && ./gradlew assembleRelease`
  2. ارفع APK لـ Vercel
  