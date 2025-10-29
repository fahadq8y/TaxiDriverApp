package com.taxidriverapp;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

/**
 * PersistentTrackingService - خدمة مستمرة للتتبع
 * 
 * تعمل في الخلفية وتراقب حالة التتبع
 * إذا توقف النظام الخدمة، تعيد تشغيل نفسها تلقائياً
 */
public class PersistentTrackingService extends Service {
    private static final String TAG = "PersistentTracking";
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service created");
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service started");
        
        // هنا يمكن إضافة منطق للتحقق من حالة التتبع
        // وإعادة تشغيله إذا لزم الأمر
        
        // START_STICKY: إذا قتل النظام الخدمة، سيعيد تشغيلها تلقائياً
        return START_STICKY;
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Service destroyed - will be restarted by system");
        
        // محاولة إعادة تشغيل الخدمة
        Intent restartIntent = new Intent(getApplicationContext(), PersistentTrackingService.class);
        startService(restartIntent);
    }
    
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.d(TAG, "Task removed - keeping service alive");
        
        // إعادة تشغيل الخدمة حتى لو أزال المستخدم التطبيق من Recent Apps
        Intent restartIntent = new Intent(getApplicationContext(), PersistentTrackingService.class);
        startService(restartIntent);
    }
}

