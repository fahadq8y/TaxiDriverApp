package com.dp.taxidriver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

/**
 * ForceTrackingService - حزام أمان إضافي فوق Transistor BackgroundGeolocation
 *
 * v2.7.7 (الحل #5): أعدنا الـ Handler loop (بدون AlarmManager) داخل الـ Service فقط
 *   - يفحص نفسه كل 60 ثانية أنه شغال
 *   - يكتب heartbeat في SharedPreferences (يقرأها JS عند الحاجة)
 *   - لا يفتح أي Activity ولا يستيقظ النظام بشكل خارجي → ما يفتح التطبيق تلقائياً
 *   - يعيد تشغيل نفسه إذا قتل (START_STICKY + onDestroy restart)
 *
 * v2.5.10: حذف AlarmManager loop (كان يفتح التطبيق على أجهزة Display-over-other-apps).
 * التتبع الفعلي يعتمد على Transistor (TrackingService + HeadlessTask) — هذه الخدمة فقط حزام أمان.
 */
public class ForceTrackingService extends Service {
    private static final String TAG = "ForceTrackingService";
    private static final String CHANNEL_ID = "ForceTracking";
    private static final int NOTIFICATION_ID = 999;
    private static final long SELF_CHECK_INTERVAL_MS = 60_000; // 60 ثانية
    private static final String PREFS_NAME = "ForceTrackingPrefs";
    private static final String KEY_LAST_HEARTBEAT = "lastHeartbeat";
    private static final String KEY_HEARTBEAT_COUNT = "heartbeatCount";

    private Handler selfCheckHandler;
    private Runnable selfCheckRunnable;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate - Service created (v2.7.7)");
        createNotificationChannel();

        // بدء الخدمة كـ foreground service (مطلوب لـ Android 8+)
        startForeground(NOTIFICATION_ID, createInvisibleNotification());

        // v2.7.7 (الحل #5): شغل الـ self-check loop داخل الـ Service فقط
        startSelfCheckLoop();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand - Service started");
        // أعد كتابة heartbeat كل start
        writeHeartbeat();
        // START_STICKY: لو النظام قتل الخدمة، يعيد تشغيلها تلقائياً
        return START_STICKY;
    }

    /**
     * v2.7.7 (الحل #5): self-check loop كل 60 ثانية
     * يكتب heartbeat في SharedPreferences فقط (لا يفتح Activity ولا يستيقظ شي خارجي)
     */
    private void startSelfCheckLoop() {
        if (selfCheckHandler != null) return;
        selfCheckHandler = new Handler(Looper.getMainLooper());
        selfCheckRunnable = new Runnable() {
            @Override
            public void run() {
                try {
                    writeHeartbeat();
                    Log.d(TAG, "self-check tick — service alive");
                } catch (Exception e) {
                    Log.e(TAG, "self-check error: " + e.getMessage());
                } finally {
                    if (selfCheckHandler != null) {
                        selfCheckHandler.postDelayed(this, SELF_CHECK_INTERVAL_MS);
                    }
                }
            }
        };
        selfCheckHandler.postDelayed(selfCheckRunnable, SELF_CHECK_INTERVAL_MS);
        Log.d(TAG, "self-check loop started (60s interval)");
    }

    private void stopSelfCheckLoop() {
        if (selfCheckHandler != null && selfCheckRunnable != null) {
            selfCheckHandler.removeCallbacks(selfCheckRunnable);
        }
        selfCheckHandler = null;
        selfCheckRunnable = null;
    }

    private void writeHeartbeat() {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            long now = System.currentTimeMillis();
            int count = prefs.getInt(KEY_HEARTBEAT_COUNT, 0) + 1;
            prefs.edit()
                .putLong(KEY_LAST_HEARTBEAT, now)
                .putInt(KEY_HEARTBEAT_COUNT, count)
                .apply();
        } catch (Exception e) {
            Log.w(TAG, "writeHeartbeat failed: " + e.getMessage());
        }
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
        stopSelfCheckLoop();

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
