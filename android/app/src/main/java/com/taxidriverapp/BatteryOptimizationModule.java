package com.taxidriverapp;

  import android.content.Context;
  import android.content.Intent;
  import android.net.Uri;
  import android.os.Build;
  import android.os.PowerManager;
  import android.provider.Settings;

  import com.facebook.react.bridge.Promise;
  import com.facebook.react.bridge.ReactApplicationContext;
  import com.facebook.react.bridge.ReactContextBaseJavaModule;
  import com.facebook.react.bridge.ReactMethod;

  public class BatteryOptimizationModule extends ReactContextBaseJavaModule {
      private final ReactApplicationContext reactContext;

      public BatteryOptimizationModule(ReactApplicationContext reactContext) {
          super(reactContext);
          this.reactContext = reactContext;
      }

      @Override
      public String getName() {
          return "BatteryOptimization";
      }

      @ReactMethod
      public void isIgnoringBatteryOptimizations(Promise promise) {
          try {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                  PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
                  String packageName = reactContext.getPackageName();
                  boolean isIgnoring = pm.isIgnoringBatteryOptimizations(packageName);
                  promise.resolve(isIgnoring);
              } else {
                  promise.resolve(true);
              }
          } catch (Exception e) {
              promise.reject("ERROR", e.getMessage());
          }
      }

      @ReactMethod
      public void requestIgnoreBatteryOptimizations() {
          try {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                  Intent intent = new Intent();
                  intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                  intent.setData(Uri.parse("package:" + reactContext.getPackageName()));
                  intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                  reactContext.startActivity(intent);
              }
          } catch (Exception e) {
              e.printStackTrace();
          }
      }

      // ===== v2.7.12: Overlay (Display over other apps) Permission =====
      @ReactMethod
      public void canDrawOverlays(Promise promise) {
          try {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                  boolean canDraw = Settings.canDrawOverlays(reactContext);
                  promise.resolve(canDraw);
              } else {
                  promise.resolve(true);
              }
          } catch (Exception e) {
              promise.reject("ERROR", e.getMessage());
          }
      }

      @ReactMethod
      public void requestOverlayPermission() {
          try {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                  Intent intent = new Intent(
                      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                      Uri.parse("package:" + reactContext.getPackageName())
                  );
                  intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                  reactContext.startActivity(intent);
              }
          } catch (Exception e) {
              e.printStackTrace();
          }
      }

      // ===== v2.7.13: Notification Settings (يفتح صفحة Notifications مباشرة، مو App Info العامة) =====
      @ReactMethod
      public void openNotificationSettings() {
          try {
              Intent intent;
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                  // Android 8+: فتح Notification Settings للتطبيق مباشرة
                  intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                  intent.putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.getPackageName());
              } else {
                  // Android < 8: fallback على App Info
                  intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                  intent.setData(Uri.parse("package:" + reactContext.getPackageName()));
              }
              intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
              reactContext.startActivity(intent);
          } catch (Exception e) {
              e.printStackTrace();
          }
      }

      // ===== v2.7.13: Location Permission Page (App Permissions screen) =====
      // لـ Background Location على Android 11+ — أفضل من Linking.openSettings()
      @ReactMethod
      public void openLocationPermissionSettings() {
          try {
              // App Info → السائق يضغط Permissions → Location → "السماح طول الوقت"
              Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
              intent.setData(Uri.parse("package:" + reactContext.getPackageName()));
              intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
              reactContext.startActivity(intent);
          } catch (Exception e) {
              e.printStackTrace();
          }
      }

      // ===== v2.7.15: Device brand detection (إصلاح B) =====
      @ReactMethod
      public void getDeviceBrand(Promise promise) {
          try {
              String brand = (Build.BRAND != null ? Build.BRAND : "").toLowerCase();
              String manufacturer = (Build.MANUFACTURER != null ? Build.MANUFACTURER : "").toLowerCase();
              String model = (Build.MODEL != null ? Build.MODEL : "");
              promise.resolve(brand + "|" + manufacturer + "|" + model);
          } catch (Exception e) {
              promise.reject("ERROR", e.getMessage());
          }
      }

      // ===== v2.7.15: HONOR/HUAWEI Protected Apps =====
      // يفتح صفحة "Protected Apps" أو "Phone Manager → Protected apps"
      // التطبيقات المحمية لا يقتلها HONOR في الخلفية
      @ReactMethod
      public void openHonorProtectedApps() {
          try {
              Intent intent = null;
              // محاولات متعددة لأن الـ intent يختلف بين إصدارات Magic OS
              String[][] candidates = new String[][] {
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity"},
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.power.ui.HwPowerManagerActivity"},
              };
              for (String[] c : candidates) {
                  try {
                      intent = new Intent();
                      intent.setClassName(c[0], c[1]);
                      intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                      reactContext.startActivity(intent);
                      return;
                  } catch (Exception ignore) { intent = null; }
              }
              // fallback: افتح Battery Optimization العادي
              if (intent == null) {
                  Intent fb = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                  fb.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                  reactContext.startActivity(fb);
              }
          } catch (Exception e) { e.printStackTrace(); }
      }

      // ===== v2.7.15: HONOR/HUAWEI Auto-Launch =====
      @ReactMethod
      public void openHonorAutoLaunch() {
          try {
              String[][] candidates = new String[][] {
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity"},
              };
              for (String[] c : candidates) {
                  try {
                      Intent intent = new Intent();
                      intent.setClassName(c[0], c[1]);
                      intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                      reactContext.startActivity(intent);
                      return;
                  } catch (Exception ignore) {}
              }
              // fallback
              Intent fb = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
              fb.setData(Uri.parse("package:" + reactContext.getPackageName()));
              fb.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
              reactContext.startActivity(fb);
          } catch (Exception e) { e.printStackTrace(); }
      }

      // ===== v2.7.17: HONOR Whitelisted WakeLock =====
      // HwPFWService يقتل الـ wakelocks بعد 60 دقيقة، إلا إذا كان tag في القائمة البيضاء
      // (مثل *location* أو *alarm*). هذا الـ wakelock يكمل التتبع بعد الساعة الأولى
      private static PowerManager.WakeLock honorWakeLock = null;

      @ReactMethod
      public void acquireHonorWakelock(Promise promise) {
          try {
              PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
              if (honorWakeLock != null && honorWakeLock.isHeld()) {
                  promise.resolve("already_held");
                  return;
              }
              // tag في القائمة البيضاء لـ HwPFWService
              honorWakeLock = pm.newWakeLock(
                  PowerManager.PARTIAL_WAKE_LOCK,
                  "LocationManagerService:TaxiDriver"
              );
              honorWakeLock.setReferenceCounted(false);
              honorWakeLock.acquire(); // unlimited (نديره يدوياً)
              promise.resolve("acquired");
          } catch (Exception e) {
              promise.reject("ERR_WAKELOCK", e.getMessage());
          }
      }

      @ReactMethod
      public void releaseHonorWakelock(Promise promise) {
          try {
              if (honorWakeLock != null && honorWakeLock.isHeld()) {
                  honorWakeLock.release();
                  honorWakeLock = null;
                  promise.resolve("released");
              } else {
                  promise.resolve("not_held");
              }
          } catch (Exception e) {
              promise.reject("ERR_WAKELOCK", e.getMessage());
          }
      }

      @ReactMethod
      public void cycleHonorWakelock(Promise promise) {
          try {
              // release + reacquire — يكسر دورة 60 دقيقة لـ HwPFWService
              if (honorWakeLock != null && honorWakeLock.isHeld()) {
                  honorWakeLock.release();
              }
              PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
              honorWakeLock = pm.newWakeLock(
                  PowerManager.PARTIAL_WAKE_LOCK,
                  "LocationManagerService:TaxiDriver"
              );
              honorWakeLock.setReferenceCounted(false);
              honorWakeLock.acquire();
              promise.resolve("cycled");
          } catch (Exception e) {
              promise.reject("ERR_WAKELOCK", e.getMessage());
          }
      }

      // ===== v2.7.15: HONOR/HUAWEI Power-Intensive Prompt (مهم جداً!) =====
      @ReactMethod
      public void openHonorPowerIntensive() {
          try {
              String[][] candidates = new String[][] {
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.power.ui.HwPowerManagerActivity"},
                  {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.bootstart.BootStartActivity"},
              };
              for (String[] c : candidates) {
                  try {
                      Intent intent = new Intent();
                      intent.setClassName(c[0], c[1]);
                      intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                      reactContext.startActivity(intent);
                      return;
                  } catch (Exception ignore) {}
              }
              // fallback: Battery settings
              Intent fb = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
              fb.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
              reactContext.startActivity(fb);
          } catch (Exception e) { e.printStackTrace(); }
      }
  }
  