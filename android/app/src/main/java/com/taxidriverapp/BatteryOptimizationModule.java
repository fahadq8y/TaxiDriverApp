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
                // Android < 6.0 doesn't have battery optimization
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
}

