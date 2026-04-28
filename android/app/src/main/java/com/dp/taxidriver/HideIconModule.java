package com.dp.taxidriver;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

/**
 * HideIconModule - يخفي/يظهر أيقونة التطبيق من الـ Launcher
 * 
 * الفكرة: نستخدم activity-alias في AndroidManifest.
 * - hideIcon(): يعطّل الـ alias → الأيقونة تختفي من الـ launcher
 * - showIcon(): يفعّل الـ alias → الأيقونة ترجع
 * 
 * ملاحظة: التطبيق نفسه يستمر بالعمل حتى لو الأيقونة مخفية.
 * لإعادة الفتح بعد الإخفاء: من إعدادات الجوال > Apps > "خدمات النظام" > Open
 */
public class HideIconModule extends ReactContextBaseJavaModule {
    private static final String TAG = "HideIconModule";
    private static final String ALIAS_NAME = "com.dp.taxidriver.MainActivityAlias";

    public HideIconModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "HideIconModule";
    }

    @ReactMethod
    public void hideIcon(Promise promise) {
        try {
            Context ctx = getReactApplicationContext();
            PackageManager pm = ctx.getPackageManager();
            ComponentName alias = new ComponentName(ctx.getPackageName(), ALIAS_NAME);
            pm.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
            Log.d(TAG, "Icon hidden");
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "hideIcon error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void showIcon(Promise promise) {
        try {
            Context ctx = getReactApplicationContext();
            PackageManager pm = ctx.getPackageManager();
            ComponentName alias = new ComponentName(ctx.getPackageName(), ALIAS_NAME);
            pm.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            );
            Log.d(TAG, "Icon shown");
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "showIcon error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isIconHidden(Promise promise) {
        try {
            Context ctx = getReactApplicationContext();
            PackageManager pm = ctx.getPackageManager();
            ComponentName alias = new ComponentName(ctx.getPackageName(), ALIAS_NAME);
            int state = pm.getComponentEnabledSetting(alias);
            boolean hidden = (state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED);
            promise.resolve(hidden);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
