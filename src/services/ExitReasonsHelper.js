/**
 * ExitReasonsHelper.js — v2.7.19
 * يقرأ أسباب قتل التطبيق من Android نفسه (API 30+).
 * مفيد لكشف غير مباشر لإلغاء صلاحيات HONOR (p7/p8/p9):
 *  - REASON_EXCESSIVE_RESOURCE_USAGE (9) → HONOR قتل التطبيق = p7 على الأغلب ملغية
 *  - REASON_PERMISSION_CHANGE (8) → صلاحية انغلقت من النظام
 *  - REASON_OTHER (13) → سبب غامض (HONOR Phone Manager غالباً)
 */
import { NativeModules, Platform } from 'react-native';

const { ExitReasons } = NativeModules;

// أسباب نعتبرها مؤشّر إلغاء HONOR
const HONOR_KILL_REASONS = new Set([8, 9, 13, 14]); // PERMISSION_CHANGE, EXCESSIVE_RESOURCE_USAGE, OTHER, FREEZER

export async function getExitReasons(maxNum = 20) {
  if (Platform.OS !== 'android' || !ExitReasons?.getExitReasons) {
    return { supported: false, reasons: [] };
  }
  try {
    const result = await ExitReasons.getExitReasons(maxNum);
    if (!result || result.length === 0) {
      return { supported: true, reasons: [] };
    }
    // أول عنصر قد يكون meta لو غير مدعوم
    if (result[0] && result[0].supported === false) {
      return { supported: false, sdkVersion: result[0].sdkVersion, reasons: [] };
    }
    return { supported: true, reasons: result };
  } catch (e) {
    console.warn('[ExitReasons] error:', e.message);
    return { supported: false, error: e.message, reasons: [] };
  }
}

/**
 * يحلل آخر ساعة (أو فترة محددة) ويرجع ملخص:
 * - honorKills: عدد المرات اللي HONOR قتل التطبيق
 * - normalKills: عدد القتلات الطبيعية (CRASH, LOW_MEMORY, USER_REQUESTED)
 * - lastHonorKill: آخر مرة قُتل من HONOR (timestamp أو null)
 * - p7SuspectScore: 0-100 — كل ما زاد كل ما زاد احتمال p7 ملغية
 */
export async function analyzeRecentKills(windowMs = 60 * 60 * 1000) {
  const { supported, reasons } = await getExitReasons(20);
  if (!supported || !reasons.length) {
    return { supported, honorKills: 0, normalKills: 0, lastHonorKill: null, p7SuspectScore: 0, recent: [] };
  }
  const cutoff = Date.now() - windowMs;
  const recent = reasons.filter(r => r.timestamp >= cutoff);

  let honorKills = 0;
  let normalKills = 0;
  let lastHonorKill = null;

  for (const r of recent) {
    if (HONOR_KILL_REASONS.has(r.reason)) {
      honorKills++;
      if (!lastHonorKill || r.timestamp > lastHonorKill) lastHonorKill = r.timestamp;
    } else if ([3, 4, 5, 6, 10, 11].includes(r.reason)) {
      normalKills++;
    }
  }

  // درجة الشك: 0 قتلة → 0%, 1 → 30%, 2 → 60%, 3+ → 90%
  let p7SuspectScore = 0;
  if (honorKills === 1) p7SuspectScore = 30;
  else if (honorKills === 2) p7SuspectScore = 60;
  else if (honorKills >= 3) p7SuspectScore = 90;

  return { supported: true, honorKills, normalKills, lastHonorKill, p7SuspectScore, recent };
}

/**
 * Confidence Score لصلاحية HONOR معينة (p7/p8/p9):
 * يحسبها من عدة مصادر:
 *  +40 إذا السائق ضغط زر التفعيل (AsyncStorage = 'true')
 *  +20 إذا ما اتقتل من EXCESSIVE_RESOURCE_USAGE في آخر 24 ساعة
 *  +20 إذا التتبع منتظم (مفتاح TrackingHealth)
 *  +10 إذا فعّلها مرة ثانية بعد إلغاء (recovery)
 *  +10 إذا الـ wakelock عاش > ساعة
 * < 50 → اطلب إعادة تأكيد
 * < 25 → critical
 */
export async function getPermissionConfidence(permKey, opts = {}) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const { lastLocAgeMin = 999, wakelockAgeMin = 0 } = opts;

    let score = 0;
    const reasons = [];

    const confirmed = (await AsyncStorage.getItem(permKey)) === 'true';
    if (confirmed) {
      score += 40;
      reasons.push('user_confirmed');
    }

    const wasInvalidated = await AsyncStorage.getItem(permKey + '_invalidated_reason');
    if (wasInvalidated) {
      score -= 20;
      reasons.push('previously_invalidated:' + wasInvalidated);
    }

    // فحص ExitReasons
    if (permKey === 'honor_p7_confirmed') {
      const { honorKills } = await analyzeRecentKills(24 * 60 * 60 * 1000);
      if (honorKills === 0) {
        score += 20;
        reasons.push('no_honor_kills_24h');
      } else {
        score -= honorKills * 10;
        reasons.push(`honor_kills_24h:${honorKills}`);
      }
    }

    // التتبع المنتظم
    if (lastLocAgeMin <= 10) {
      score += 20;
      reasons.push('tracking_active');
    } else if (lastLocAgeMin > 60) {
      score -= 15;
      reasons.push('tracking_stale');
    }

    // عمر الـ wakelock
    if (wakelockAgeMin >= 60) {
      score += 10;
      reasons.push('wakelock_long');
    }

    // recovery: لو فيه recovery flag
    const recovered = await AsyncStorage.getItem(permKey + '_recovered_count');
    if (recovered && parseInt(recovered) > 0) {
      score += 10;
      reasons.push('recovered:' + recovered);
    }

    score = Math.max(0, Math.min(100, score));
    let level = 'unknown';
    if (score >= 75) level = 'high';
    else if (score >= 50) level = 'medium';
    else if (score >= 25) level = 'low';
    else level = 'critical';

    return { score, level, reasons, confirmed };
  } catch (e) {
    return { score: 0, level: 'error', reasons: [e.message], confirmed: false };
  }
}
