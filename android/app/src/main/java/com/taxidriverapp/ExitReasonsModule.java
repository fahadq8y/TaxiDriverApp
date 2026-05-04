package com.taxidriverapp;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.List;

/**
 * ExitReasonsModule (v2.7.19)
 * يقرأ أسباب قتل التطبيق الفعلية من Android 11+ ActivityManager.getHistoricalProcessExitReasons
 * يستخدم لكشف غير مباشر لإلغاء صلاحيات HONOR (p7/p8/p9).
 */
public class ExitReasonsModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public ExitReasonsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "ExitReasons";
    }

    @ReactMethod
    public void getExitReasons(int maxNum, Promise promise) {
        try {
            WritableArray result = Arguments.createArray();

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                // Android < 11 — API غير متوفر
                WritableMap meta = Arguments.createMap();
                meta.putBoolean("supported", false);
                meta.putInt("sdkVersion", Build.VERSION.SDK_INT);
                result.pushMap(meta);
                promise.resolve(result);
                return;
            }

            ActivityManager am = (ActivityManager) reactContext.getSystemService(Context.ACTIVITY_SERVICE);
            String packageName = reactContext.getPackageName();
            List<ApplicationExitInfo> infos = am.getHistoricalProcessExitReasons(packageName, 0, maxNum);

            for (ApplicationExitInfo info : infos) {
                WritableMap m = Arguments.createMap();
                m.putBoolean("supported", true);
                m.putInt("reason", info.getReason());
                m.putString("reasonName", reasonToName(info.getReason()));
                m.putInt("status", info.getStatus());
                m.putInt("importance", info.getImportance());
                m.putString("description", info.getDescription() != null ? info.getDescription() : "");
                m.putString("processName", info.getProcessName() != null ? info.getProcessName() : "");
                m.putDouble("timestamp", (double) info.getTimestamp());
                m.putInt("pid", info.getPid());
                result.pushMap(m);
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("EXIT_REASONS_ERROR", e.getMessage());
        }
    }

    private String reasonToName(int reason) {
        switch (reason) {
            case 0: return "UNKNOWN";
            case 1: return "EXIT_SELF";
            case 2: return "SIGNALED";
            case 3: return "LOW_MEMORY";
            case 4: return "CRASH";
            case 5: return "CRASH_NATIVE";
            case 6: return "ANR";
            case 7: return "INITIALIZATION_FAILURE";
            case 8: return "PERMISSION_CHANGE";
            case 9: return "EXCESSIVE_RESOURCE_USAGE";
            case 10: return "USER_REQUESTED";
            case 11: return "USER_STOPPED";
            case 12: return "DEPENDENCY_DIED";
            case 13: return "OTHER";
            case 14: return "FREEZER";
            case 15: return "PACKAGE_STATE_CHANGE";
            case 16: return "PACKAGE_UPDATED";
            default: return "REASON_" + reason;
        }
    }
}
