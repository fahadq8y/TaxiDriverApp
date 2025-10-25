/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';

// Register main app component
AppRegistry.registerComponent(appName, () => App);

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
      
      // Save to Firestore using set with merge
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
          lastUpdate: new Date(),
          isActive: true,
        }, { merge: true });
      
      console.log('[HeadlessTask] Location saved successfully to Firestore');
      
    } catch (error) {
      console.error('[HeadlessTask] Error saving location:', error);
    }
  }
};

// Register the headless task
BackgroundGeolocation.registerHeadlessTask(HeadlessTask);
