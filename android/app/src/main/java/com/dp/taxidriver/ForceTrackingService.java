package com.dp.taxidriver;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.app.PendingIntent;
import android.content.Context;
import android.os.PowerManager;
import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.util.Log;

/**
 * ForceTrackingService - خدمة قوية لضمان استمرار التتبع
 * 
 * الميزات:
 * - START_STICKY: يعيد Android الخدمة تلقائياً إذا توقفت
 * - AlarmManager: فحص دوري كل دقيقة
 * - onDestroy: إعادة تشغيل فورية
 */
public class ForceTrackingService extends Service {
    private static final String TAG = "ForceTrackingService";
    private static final String CHANNEL_ID = "ForceTracking";
    private static final int NOTIFICATION_ID = 999;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate - Service created");
        createNotificationChannel();
        
        // بدء الخدمة كـ foreground service
        startForeground(NOTIFICATION_ID, createInvisibleNotification());
        
        // جدولة فحص دوري
        scheduleServiceCheck();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand - Service started");
        
        // جدولة إعادة التشغيل كل دقيقة
        scheduleServiceCheck();
        
        // إعادة START_STICKY للإعادة التلقائية
        return START_STICKY;
    }
    
    private void scheduleServiceCheck() {
        AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(this, ServiceCheckReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(this, 0, intent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        
        // فحص كل دقيقة
        long intervalMillis = 60 * 1000; // 1 minute
        long triggerAtMillis = System.currentTimeMillis() + intervalMillis;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        }
        
        Log.d(TAG, "Service check scheduled for 1 minute from now");
    }
    
    private Notification createInvisibleNotification() {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        
        return builder
            .setContentTitle("خدمة النظام")
            .setContentText("")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(Notification.PRIORITY_MIN)
            .setOngoing(true)
            .build();
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "خدمة النظام", NotificationManager.IMPORTANCE_MIN);
            channel.setDescription("");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "onDestroy - Service destroyed, restarting...");
        
        // إعادة تشغيل الخدمة فوراً
        Intent restartIntent = new Intent(this, ForceTrackingService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(restartIntent);
        } else {
            startService(restartIntent);
        }
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    /**
     * ServiceCheckReceiver - يفحص الخدمة كل دقيقة ويعيد تشغيلها إذا لزم الأمر
     */
    public static class ServiceCheckReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "ServiceCheckReceiver - Checking service status");
            
            Intent serviceIntent = new Intent(context, ForceTrackingService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        }
    }
}

