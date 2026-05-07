# v2.7.21 — Deep F12-style Diagnostics

  **Release date:** 2026-05-07
  **Codename:** "X-Ray"

  ## ما الجديد للسائق؟
  لا شي مرئي. هذا التحديث للإدارة فقط — يعطيها رؤية أعمق لحالة التطبيق على جهازك.

  ## ما الجديد للإدارة؟
  صفحة `driver-diagnostics.html` صارت تعرض:

  ### بيانات جديدة من الجهاز
  - **Doze mode** (وضع السبات) — هل النظام أوقف التطبيق مؤقتاً؟
  - **App Standby Bucket** (دلو الاستعداد) — أي تصنيف وضعك النظام فيه (active/working/frequent/rare/restricted/never)
  - **Background Restricted** — هل أوقف النظام التطبيق نهائياً في الخلفية؟
  - **Memory** — كم RAM مستخدمة من النظام والتطبيق
  - **Network** — wifi / cellular / ethernet + هل validated
  - **Logs ring buffer** — آخر 200 رسالة console.log/warn/error

  ### أوامر بعيدة جديدة
  - `dump_logs` — يجيب آخر 200 log فوراً
  - `open_power_manager` — يفتح صفحة "Protected Apps" المخصصة لـ HONOR/Huawei/Xiaomi/OPPO/Vivo/Samsung على جهاز السائق

  ## التغييرات التقنية

  ### Native (Kotlin)
  - **جديد**: `com/taxidriverapp/DiagnosticsModule.kt`
    - `getPowerState()` — Doze, Standby Bucket, Background Restricted, Power Save, isIgnoringBatteryOptimizations
    - `getNetworkInfo()` — type, validated, bandwidth (API 29+)
    - `getMemoryInfo()` — system avail/total + app used/max
    - `openPowerManager(brand)` — multi-fallback OEM intents
  - **جديد**: `com/taxidriverapp/DiagnosticsPackage.kt`
  - **معدّل**: `com/dp/taxidriver/MainApplication.kt` — تسجيل DiagnosticsPackage

  ### JavaScript
  - **معدّل**: `src/services/SelfDiagnostics.js`
    - `logBuffer` field + `attachLogCapture()` يلتقط console.* في 200-entry ring
    - `buildSnapshot()` يرفع: `snap.doze`, `snap.network`, `snap.memory`, `snap.firestoreStats`, `snap.logs`, `snap.logCount`
    - أوامر جديدة: `dump_logs`, `open_power_manager`

  ## التوافق العكسي
  - لو `DiagnosticsModule` غير متوفر (نسخة قديمة)، الكود ينزل بهدوء (graceful) — ما يكسر شي
  - صفحة `driver-diagnostics.html` تعرض "—" للحقول اللي ما وصلت

  ## كومتات
  - `bdf2dba1` — DiagnosticsModule.kt + DiagnosticsPackage.kt
  - `9d435391` — MainApplication.kt يسجّل DiagnosticsPackage
  - `0ef72429` — SelfDiagnostics dump_logs + open_power_manager + attachLogCapture method
  - `b6d690ac` — SelfDiagnostics buildSnapshot enrichment + logBuffer field + attachLogCapture call
  - (Test-taxi) `13cb263c` — driver-diagnostics.html F12 dashboard
  - (Test-taxi) `8e1344cc` — driver-details.html زر محدّث

  ## خطوات النشر
  1. `cd android && ./gradlew assembleRelease`
  2. ارفع APK لـ `/apk-update` على Vercel
  3. السائقين يستلمون التحديث تلقائياً (in-app update prompt في v2.7.20+)

  ## ما تأجل لـ v2.7.22
  - per-point enrichment (appVersion + batteryLevel + source + networkType في كل نقطة locationHistory)
  - Memory time series (تخزين نقاط memory كل 30 ثانية للرسم البياني)
  - FCM wake-up reason capture (لمعرفة سبب الـ silent kill)
  