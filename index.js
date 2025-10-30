/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';

// Register main app component
AppRegistry.registerComponent(appName, () => App);

// Calculate distance between two coordinates in meters (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

// Check if we should save this location to history (using AsyncStorage for persistence)
// Smart Stop Detection: يحفظ بشكل أقل عندما السائق متوقف
const shouldSaveToHistory = async (location) => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const now = Date.now();
  const currentLat = location.coords.latitude;
  const currentLng = location.coords.longitude;
  // Handle null/undefined speed values safely
  const currentSpeed = location.coords.speed ?? 0; // m/s - use nullish coalescing
  
  try {
    // Read last save time and location from AsyncStorage
    const lastTimeStr = await AsyncStorage.getItem('lastHistorySaveTime');
    const lastLocationStr = await AsyncStorage.getItem('lastHistorySaveLocation');
    
    // Save if it's the first location
    if (!lastTimeStr || !lastLocationStr) {
      console.log('[shouldSaveToHistory] First location - will save');
      return true;
    }
    
    const lastHistorySaveTime = parseInt(lastTimeStr, 10);
    const lastHistorySaveLocation = JSON.parse(lastLocationStr);
    const timeDiff = now - lastHistorySaveTime;
    
    // Smart Stop Detection: إذا السائق متوقف (speed < 1 km/h = 0.28 m/s)
    if (currentSpeed < 0.28) {
      // احفظ كل 5 دقائق فقط (12 نقطة/ساعة)
      if (timeDiff >= 300000) { // 5 minutes
        console.log(`[shouldSaveToHistory] Driver stopped (${Math.round(currentSpeed*3.6)} km/h) - saving after ${Math.round(timeDiff/1000)}s`);
        return true;
      }
      console.log(`[shouldSaveToHistory] Driver stopped - skip (${Math.round(timeDiff/1000)}s < 300s)`);
      return false;
    } else {
      // إذا السائق يتحرك
      // احفظ كل دقيقة
      if (timeDiff >= 60000) { // 1 minute
        console.log(`[shouldSaveToHistory] Driver moving (${Math.round(currentSpeed*3.6)} km/h) - saving after ${Math.round(timeDiff/1000)}s`);
        return true;
      }
      
      // أو إذا تحرك 50 متر
      const lastLat = lastHistorySaveLocation.latitude;
      const lastLng = lastHistorySaveLocation.longitude;
      const distance = calculateDistance(lastLat, lastLng, currentLat, currentLng);
      if (distance >= 50) { // 50 meters
        console.log(`[shouldSaveToHistory] Driver moved ${Math.round(distance)}m - saving`);
        return true;
      }
      
      console.log(`[shouldSaveToHistory] Driver moving - skip (${Math.round(timeDiff/1000)}s < 60s, ${Math.round(distance)}m < 50m)`);
      return false;
    }
    
  } catch (error) {
    console.error('[shouldSaveToHistory] Error:', error);
    // In case of error, save to be safe
    return true;
  }
};

// Register Headless Task for background tracking when app is terminated
const HeadlessTask = async (event) => {
  const { name, params } = event;
  
  console.log('[HeadlessTask] Event received:', name);
  
  if (name === 'location') {
    const location = params;
    console.log('[HeadlessTask] Location received:', location.coords);
    
    try {
      // Get driver ID from storage
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const driverId = await AsyncStorage.getItem('employeeNumber');
      
      if (!driverId) {
        console.warn('[HeadlessTask] No driver ID found, skipping location save');
        return;
      }
      
      console.log('[HeadlessTask] Saving location for driver:', driverId);
      
      // Save to drivers collection (current location)
      await firestore()
        .collection('drivers')
        .doc(driverId)
        .set({
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: location.coords.speed || 0,
            heading: location.coords.heading || 0,
          },
          // Also save location directly in driver document (for easy access)
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: location.coords.speed || 0,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading || -1,
          lastUpdate: new Date(),
          isActive: true,
        }, { merge: true });
      
      console.log('[HeadlessTask] Location saved successfully to drivers collection');
      
      // Save to locationHistory if conditions are met
      if (await shouldSaveToHistory(location)) {
        try {
          // Calculate expiry date (2 months from now)
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 2);
          
          await firestore()
            .collection('locationHistory')
            .add({
              driverId: driverId,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 0,
              speed: location.coords.speed || 0,
              heading: location.coords.heading || 0,
              timestamp: new Date(),
              expiryDate: expiryDate,
              appState: 'background',
              userId: driverId,
            });
          
          // Update last save time and location in AsyncStorage
          await AsyncStorage.setItem('lastHistorySaveTime', Date.now().toString());
          await AsyncStorage.setItem('lastHistorySaveLocation', JSON.stringify({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }));
          
          console.log('[HeadlessTask] Location saved to locationHistory');
        } catch (historyError) {
          console.error('[HeadlessTask] Error saving to locationHistory:', historyError);
          // Don't throw - just log the error
        }
      } else {
        console.log('[HeadlessTask] Skipping locationHistory save (conditions not met)');
      }
      
    } catch (error) {
      console.error('[HeadlessTask] Error saving location:', error);
    }
  }
};

// Register the headless task
BackgroundGeolocation.registerHeadlessTask(HeadlessTask);

// ===== FCM BACKGROUND MESSAGE HANDLER =====
// This handler is called when the app receives a push notification while in background/killed state
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM] Background message received:', JSON.stringify(remoteMessage));
  
  try {
    if (remoteMessage.data?.type === 'wake_up') {
      console.log('[FCM] Wake-up push received - attempting to restart tracking');
      
      // Get driver ID from message or AsyncStorage
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const driverId = remoteMessage.data.driverId || await AsyncStorage.getItem('employeeNumber');
      
      if (driverId) {
        console.log('[FCM] Driver ID:', driverId);
        
        // Try to restart BackgroundGeolocation
        try {
          const state = await BackgroundGeolocation.start();
          console.log('[FCM] BackgroundGeolocation restarted successfully:', state);
          
          // Log restart event to Firebase
          await firestore()
            .collection('tracking_events')
            .add({
              type: 'fcm_restart',
              driverId: driverId,
              timestamp: firestore.FieldValue.serverTimestamp(),
              success: true,
            });
        } catch (bgError) {
          console.error('[FCM] Failed to restart BackgroundGeolocation:', bgError);
          
          // Log failure
          await firestore()
            .collection('tracking_events')
            .add({
              type: 'fcm_restart',
              driverId: driverId,
              timestamp: firestore.FieldValue.serverTimestamp(),
              success: false,
              error: bgError.message,
            });
        }
      } else {
        console.warn('[FCM] No driver ID found - cannot restart tracking');
      }
    }
  } catch (error) {
    console.error('[FCM] Error handling background message:', error);
  }
  
  return Promise.resolve();
});

console.log('[FCM] Background message handler registered');

