package com.dp.taxidriver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.Log
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
   * Create notification channels for Android 8.0+ (API 26+)
   * This is REQUIRED for Foreground Service to work properly on Android 14/15
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    createNotificationChannels()
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      
      // Check if location tracking channel already exists
      val existingLocationChannel = notificationManager.getNotificationChannel("location_tracking_channel")
      if (existingLocationChannel == null) {
        // ✅ Channel for Transistor Background Geolocation
        // Using the same Channel ID as in LocationService.js
        val locationChannel = NotificationChannel(
          "location_tracking_channel", // ✅ Matches LocationService.js
          "Background Location Service",
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "Shows when the app is tracking your location in the background"
          setShowBadge(false)
          enableVibration(false)
          setSound(null, null)
        }
        
        notificationManager.createNotificationChannel(locationChannel)
        Log.d("MainActivity", "Notification channel created: location_tracking_channel")
      } else {
        Log.d("MainActivity", "Notification channel already exists: location_tracking_channel")
      }
      
      // Check if app channel already exists
      val existingAppChannel = notificationManager.getNotificationChannel("TaxiDriverApp")
      if (existingAppChannel == null) {
        // Channel for general app notifications
        val appChannel = NotificationChannel(
          "TaxiDriverApp",
          "TaxiDriverApp Notifications", 
          NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
          description = "General app notifications"
          enableVibration(true)
        }
        
        notificationManager.createNotificationChannel(appChannel)
        Log.d("MainActivity", "Notification channel created: TaxiDriverApp")
      } else {
        Log.d("MainActivity", "Notification channel already exists: TaxiDriverApp")
      }
    }
  }
}

