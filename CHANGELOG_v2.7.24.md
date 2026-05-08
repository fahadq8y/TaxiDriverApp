# White Horse Driver — v2.7.24

**Release date:** 2026-05-08
**Type:** 🔥 Critical fix — "Tracking freezes when driver starts moving" on Honor / MagicOS

## The Problem (DRV030 — Honor Magic5 Lite, MagicOS 7.2)

After analyzing 3 independent AI diagnostics on real Firestore data, the root cause was confirmed:

1. **Honor Activity Recognition is broken** — reports `currentActivity = 'still'` with **100% confidence** even while the car is moving at 48 km/h.
2. **Filter `moving_below_threshold` was eating the start of every trip** — 128 rejections/hour on DRV030 (~31% of all incoming points).
3. **`stopTimeout: 3` minutes** was too long — RNBG waited 3 minutes before declaring motion.
4. **No watchdog** — when RNBG got stuck in stationary mode, nothing forced it out.

**Symptom:** 30-minute gap at the start of every trip. By the time the first point was saved, the driver was already 22 km away on the highway.

## What Changed

### 1. `LocationService.js` — `shouldSaveToHistory()` rewritten

- **Removed `|| isStill` from the "stationary" check.** We no longer trust Honor's Activity Recognition. Decision is based purely on RNBG's `is_moving` flag (which uses the accelerometer directly).
- **Tightened the moving filter:** distance threshold dropped from 20m → 10m, time threshold capped at 60s.
- **Added "early-acceleration window":** any point in the first 30 seconds after a `still→moving` transition is accepted unconditionally — captures slow exits from a parking spot.

### 2. `stopTimeout: 3 → 1` minute

Cuts the "RNBG declares motion" delay by 2/3.

### 3. NEW: `startTrackingWatchdog()` — runs every 90s

The root-cause fix. Logic:

```
if state.isMoving === true
   && (now - lastHistorySaveTime) >= 120 seconds:
       BackgroundGeolocation.changePace(true)
       BackgroundGeolocation.getCurrentPosition({samples:3, persist:true, extras:{source:'watchdog'}})
       _watchdogInterventions++
```

This means: **even if Honor's Activity Recognition stays stuck on `still`, the watchdog will force a fix every 2 minutes when the car is moving.** Maximum gap is now bounded by `watchdogStuckThresholdSec` (default 120s) instead of being unbounded.

Tunable from Firestore via `appConfig`:
- `watchdogEnabled` (default `true`)
- `watchdogIntervalSec` (default `90`)
- `watchdogStuckThresholdSec` (default `120`)

### 4. Tracks `_lastTransitionTime` and `_watchdogInterventions`

For the next `historyDiagnosis` upgrade — we'll be able to count how often the watchdog intervenes per device.

## Expected Impact

| Metric | v2.7.23 | v2.7.24 (target) |
|---|---|---|
| Max gap when moving (Honor) | 30+ min | ≤ 2 min |
| `moving_below_threshold` rejections/hour | 128 | < 30 |
| First-acceleration points captured | ~0 | all |
| Battery cost | baseline | +1-3% (watchdog wakes RNBG every 90s) |

## Files Changed

- `src/services/LocationService.js` — filter rewrite + watchdog + `_lastTransitionTime`
- `package.json` — version bump
- `CHANGELOG_v2.7.24.md` — this file

## Test Plan (after install on DRV030)

1. Park the car and wait until heartbeat points stabilize (~10 minutes).
2. Drive away.
3. Within 2 minutes of starting, at least one new point must appear in `locationHistory`.
4. Watch logs for `[Watchdog] 🚨 STUCK DETECTED` — should fire if Honor delays motion detection.
5. Re-run `final.cjs` after 1 hour and confirm `moving_below_threshold` count dropped sharply.
