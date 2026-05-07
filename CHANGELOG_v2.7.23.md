# v2.7.23 — Silent Drop Detector

**Release:** 2026-05-07 | **Codename:** "X-Ray-2"

## للمستخدم
لا شي مرئي. تحديث للإدارة فقط.

## المشكلة اللي يحلها
v2.7.21 أضاف تشخيص قوي (Doze, Network, Memory, Logs)، **لكن** لو كل شي أخضر والإدارة تشوف "ما فيه نقاط في `locationHistory`" — التشخيص ما يقول السبب. شفنا هذي الحالة على هاتف HONOR (DRV030):
- `lastUpdate` يتحدث كل دقيقة ✅
- `driverHealth` heartbeat شغّال ✅
- `isTracking=true`, `rnbgEnabled=true`, `queueCount=149` ✅
- **لكن** `locationHistory` متجمدة من ٢٤ دقيقة ❌

التشخيص في v2.7.21 يقيس "هل المحرك دوار؟" بس **ما يقيس "هل السيارة تتحرك فعلاً؟"** — ما عنده عدّاد لـ "نقاط محفوظة في locationHistory مقابل نقاط مستلمة من RNBG".

## الإصلاحات الثلاث

### 1) `lastHistorySaveAt` + `historySaveAgeMin`
- بعد كل كتابة ناجحة في `locationHistory` → نحفظ timestamp في AsyncStorage
- SelfDiagnostics يقرأها ويرفعها في snapshot
- لو `historySaveAgeMin > 5` و `locationReceivedAgeMin < 2` → علم أحمر `silentDropDetected`

### 2) `pointsReceivedHour` vs `pointsSavedHour` (نسبة الحفظ)
- عدّاد ساعي لكل نقطة يستلمها `onLocation` من RNBG
- عدّاد ساعي لكل كتابة ناجحة في `locationHistory`
- نسبة `saveRatePercent` تظهر في snapshot
- reset تلقائي كل ساعة

### 3) `lastWriteError` يُكتب في `driverHealth` (مو بس logcat)
- بدلاً من `console.error` اللي يضيع → نكتب الخطأ في:
  - `AsyncStorage('last_history_write_error')`
  - `driverHealth/{driverId}.lastWriteError` (يشوفه الإدارة فوراً)
- البيانات: `{at, source, message, code, name}`
- بعد كل كتابة ناجحة → الخطأ يُمسح تلقائياً

## التحليل الذكي الجديد: `historyDiagnosis`

كل snapshot يحوي:
```json
{
  "severity": "critical | degraded | ok",
  "primaryCause": "firestore_write_failing | filter_rejecting_all | no_locations_received | rnbg_silent_death | ...",
  "possibleCauses": [
    { "cause": "...", "confidence": 0-100, "evidence": "..." }
  ],
  "recommendations": ["..."]
}
```

**خمسة سيناريوهات يكشفها التشخيص تلقائياً:**

| الحالة | الكشف | التوصية |
|---|---|---|
| Firestore writes failing | `writeErrors > 0` + `lastWriteError.code` | فحص rules / network / السبب من رسالة الخطأ |
| Filter rejecting all | `rejTotal === received && saved === 0` | تحديد أكثر سبب رفض (dedup/still/distance/...) |
| No locations from RNBG | `received === 0` رغم counters شغالة | فحص Doze/Standby/perms/HONOR restarts |
| RNBG silent death | `lastLocationAgeMin > 15` | cycle wakelock أو restart RNBG |
| Partial unexplained drop | `saved + rejected + errors !== received` | شوف logs ring buffer |

## تتبع أسباب الرفض بالتفصيل

`shouldSaveToHistory` صار يحفظ `_lastRejectReason` لكل نقطة مرفوضة:
- `strict_dedup_2sec` (نفس الإحداثيات خلال ٢ ثواني)
- `duplicate_5m_5sec` (أقل من ٥م خلال ٥ ثواني)
- `still_within_backup_interval` (متوقف ولم يحن وقت backup)
- `moving_below_threshold` (يتحرك لكن أقل من saveDistance/saveInterval)

كل نوع له عدّاد منفصل في AsyncStorage و في snapshot:
```json
"rejectionBreakdown": {
  "strict_dedup_2sec": 12,
  "duplicate_5m_5sec": 45,
  "still_within_backup_interval": 230,
  "moving_below_threshold": 8
}
```

## التغييرات

### `src/services/LocationService.js`
- module-level `_incHourlyCounter(key)` — counter ساعي مع reset تلقائي
- module-level `_recordHistoryWriteError(driverId, source, err)` — يكتب في AsyncStorage + driverHealth
- `constructor`: `this._lastRejectReason = null`
- `shouldSaveToHistory`: كل return يحفظ `_lastRejectReason` (4 أسباب رفض + null للنجاح)
- `onLocation`:
  - بعد `last_location_received_at` → `_incHourlyCounter('points_received_hour')`
  - بعد كتابة ناجحة → `last_history_save_at` + remove `last_history_write_error` + `_incHourlyCounter('points_saved_hour')`
  - في catch → `_recordHistoryWriteError(...)` بدل console.error بس
  - في else (مرفوض) → `_incHourlyCounter('points_rejected_<reason>_hour')` + total

### `src/services/SelfDiagnostics.js`
- `buildSnapshot`: قسم جديد `snap.historyTracking` يحوي 12 حقل (counters + ages + breakdown + lastWriteError)
- `buildSnapshot`: `snap.historyDiagnosis` يستدعي `diagnoseHistoryDrop(...)` للتحليل الذكي
- `diagnoseHistoryDrop(ht, snap)`: دالة جديدة (~80 سطر) — تحلل خمسة سيناريوهات
- `computeHealthVerdict`: يضيف `HISTORY_DROP_<cause>` للـ issues لو severity=critical

### `package.json`
- 2.7.22 → 2.7.23

## التوافق العكسي
- AsyncStorage keys جديدة — لو ما موجودة، يقرأ 0/null بهدوء
- `historyTracking.error` لو فشل القراءة
- `historyDiagnosis` يرجع `{severity:'ok'}` لو ما عنده بيانات كافية
- snapshot القديم (driver-diagnostics.html) يتعامل مع الحقول الجديدة بدون كسر

## نشر
1. `cd android && ./gradlew assembleRelease`
2. ارفع APK لـ `/apk-update` على Vercel
3. انتظر ٥-١٠ دقايق + ساعة كاملة لتمتلئ الـ counters قبل قراءة diagnosis

## ما تأجل لـ v2.7.24
- صفحة `driver-diagnostics.html` تعرض `historyTracking` + `historyDiagnosis` بشكل مرئي (الحين تطلع كـ JSON خام)
- إضافة `_recordHistoryWriteError` للـ headless task في `index.js`
- إضافة عدّاد مماثل لـ `_bufferAndFlushCompressed` (compression branch)
