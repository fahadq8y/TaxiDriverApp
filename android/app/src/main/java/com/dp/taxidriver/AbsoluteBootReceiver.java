package com.dp.taxidriver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * AbsoluteBootReceiver - يبدأ التتبع تلقائياً بعد إعادة تشغيل الجهاز
 * 
 * يستجيب لـ:
 * - BOOT_COMPLETED: بعد إعادة تشغيل الجهاز
 * - MY_PACKAGE_REPLACED: بعد تحديث التطبيق
 * - QUICKBOOT_POWERON: بعد Quick Boot (بعض الأجهزة)
 */
public class AbsoluteBootReceiver extends BroadcastReceiver {
    private static final String TAG = "AbsoluteBootReceiver";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "onReceive - Action: " + action);
        
        if (action == null) {
            return;
        }
        
        switch (action) {
            case Intent.ACTION_BOOT_COMPLETED:
                Log.d(TAG, "Device booted - starting tracking service");
                startTrackingService(context);
                break;
                
            case Intent.ACTION_MY_PACKAGE_REPLACED:
                Log.d(TAG, "App updated - starting tracking service");
                startTrackingService(context);
                break;
                
            case "android.intent.action.QUICKBOOT_POWERON":
                Log.d(TAG, "Quick boot detected - starting tracking service");
                startTrackingService(context);
                break;
                
            default:
                Log.d(TAG, "Unknown action: " + action);
                break;
        }
    }
    
    private void startTrackingService(Context context) {
        try {
            // بدء ForceTrackingService
            Intent serviceIntent = new Intent(context, ForceTrackingService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            
            // بدء التطبيق الرئيسي (في الخلفية)
            Intent appIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
            if (appIntent != null) {
                appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                appIntent.putExtra("AUTO_START_TRACKING", true);
                context.startActivity(appIntent);
            }
            
            Log.d(TAG, "Tracking service and app started successfully");
            
        } catch (Exception e) {
            Log.e(TAG, "Error starting tracking service", e);
        }
    }
}

