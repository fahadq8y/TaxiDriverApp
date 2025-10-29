package com.dp.taxidriver;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

/**
 * ForceTrackingModule - Native Module لبدء ForceTrackingService من JavaScript
 */
public class ForceTrackingModule extends ReactContextBaseJavaModule {
    private static final String TAG = "ForceTrackingModule";
    private final ReactApplicationContext reactContext;

    public ForceTrackingModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "ForceTrackingModule";
    }

    @ReactMethod
    public void startService(Promise promise) {
        try {
            Log.d(TAG, "Starting ForceTrackingService...");
            
            Intent serviceIntent = new Intent(reactContext, ForceTrackingService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
            
            Log.d(TAG, "ForceTrackingService started successfully");
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Error starting ForceTrackingService", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopService(Promise promise) {
        try {
            Log.d(TAG, "Stopping ForceTrackingService...");
            
            Intent serviceIntent = new Intent(reactContext, ForceTrackingService.class);
            reactContext.stopService(serviceIntent);
            
            Log.d(TAG, "ForceTrackingService stopped successfully");
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Error stopping ForceTrackingService", e);
            promise.reject("ERROR", e.getMessage());
        }
    }
}

