package com.dp.taxidriver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "TaxiDriverApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Create notification channel for Android 8.0+ (API 26+)
   * This is REQUIRED for Foreground Service to work properly
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    createNotificationChannel()
  }

  private fun createNotificationChannel() {
    // Only create channel for Android 8.0+ (API 26+)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channelId = "location_tracking_channel"
      val channelName = "Location Tracking"
      val channelDescription = "Notification channel for location tracking service"
      val importance = NotificationManager.IMPORTANCE_LOW
      
      val channel = NotificationChannel(channelId, channelName, importance).apply {
        description = channelDescription
        // Don't make sound or vibration for this channel
        setSound(null, null)
        enableVibration(false)
      }
      
      // Register the channel with the system
      val notificationManager = getSystemService(NotificationManager::class.java)
      notificationManager?.createNotificationChannel(channel)
      
      android.util.Log.d("MainActivity", "Notification channel created: $channelId")
    }
  }
}

