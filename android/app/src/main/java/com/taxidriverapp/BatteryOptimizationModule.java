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
  }
  