package com.dp.taxidriver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * ForceTrackingService - حزام أمان إضافي فوق Transistor BackgroundGeolocation
 *
 * v2.5.10 (29-Apr-2026): تم حذف AlarmManager loop الذي كان يستيقظ كل دقيقة
 * لأنه كان يسبب فتح التطبيق التلقائي على الأجهزة التي فعّلت "Display over other apps".
 * التتبع الفعلي يعتمد على Transistor (TrackingService + HeadlessTask) — هذه الخدمة
 * فقط حزام أمان احتياطي.
 *
 * المتبقي من الميزات:
 * - foreground service مع notification شفاف (لا يظهر للسائق)
 * - START_STICKY: يعيد Android تشغيل الخدمة لو قتلها النظام
 * - onDestroy auto-restart: محاولة إحياء فورية
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

        // بدء الخدمة كـ foreground service (مطلوب لـ Android 8+)
        startForeground(NOTIFICATION_ID, createInvisibleNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand - Service started");
        // START_STICKY: لو النظام قتل الخدمة، يعيد تشغيلها تلقائياً
        return START_STICKY;
    }

    private Notification createInvisibleNotification() {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
            .setContentTitle("")
            .setContentText("")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(Notification.PRIORITY_MIN)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setOngoing(false)
            .setAutoCancel(true)
            .setTimeoutAfter(1000)
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

        // إعادة تشغيل الخدمة فوراً (حزام أمان)
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
}
