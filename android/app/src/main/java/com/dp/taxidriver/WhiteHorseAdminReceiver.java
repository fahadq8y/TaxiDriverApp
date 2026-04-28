package com.dp.taxidriver;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

/**
 * WhiteHorseAdminReceiver - مستقبل Device Admin
 * 
 * عند تفعيل Device Admin:
 * - زر "Force Stop" في إعدادات التطبيق يصير معطّل (رمادي)
 * - زر "Uninstall" يصير معطّل
 * - السائق ما يقدر يوقف التتبع أو يحذف التطبيق إلا بعد إلغاء Device Admin
 */
public class WhiteHorseAdminReceiver extends DeviceAdminReceiver {
    private static final String TAG = "WhiteHorseAdmin";

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.d(TAG, "Device Admin enabled - protection active");
        Toast.makeText(context, "✅ تم تفعيل الحماية بنجاح", Toast.LENGTH_LONG).show();
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        Log.w(TAG, "User requested to disable Device Admin");
        return "⚠️ تحذير: إلغاء الحماية راح يوقف نظام التتبع. الرجاء التواصل مع المدير قبل المتابعة.";
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Log.w(TAG, "Device Admin disabled - protection removed");
        Toast.makeText(context, "⚠️ تم إلغاء الحماية", Toast.LENGTH_LONG).show();
    }
}
