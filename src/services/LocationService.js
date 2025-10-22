import {PermissionsAndroid, Platform} from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';

class LocationService {
  constructor() {
    this.isConfigured = false;
    this.isTracking = false;
    this.currentDriverId = null;
  }

  async checkPermissions() {
    try {
      console.log('[LocationService] Checking permissions...');
      
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        
        console.log('[LocationService] Location permission granted:', granted);
        return granted;
      }
      
      return true; // iOS handles permissions differently
    } catch (error) {
      console.error('[LocationService] Error checking permissions:', error);
      return false;
    }
  }

  async requestPermissions() {
    try {
      console.log('[LocationService] Requesting permissions...');
      
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'إذن الموقع',
            message: 'التطبيق يحتاج إلى إذن الموقع لتتبع موقعك',
            buttonNeutral: 'اسألني لاحقاً',
            buttonNegative: 'إلغاء',
            buttonPositive: 'موافق',
          }
        );
        
        console.log('[LocationService] Permission result:', granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      
      return true;
    } catch (error) {
      console.error('[LocationService] Error requesting permissions:', error);
      return false;
    }
  }

  async configure() {
    if (this.isConfigured) {
      console.log('[LocationService] Already configured');
      return true;
    }

    try {
      console.log('[LocationService] Configuring BackgroundGeolocation...');
      
      // Check permissions first
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        console.warn('[LocationService] No location permission, requesting...');
        const granted = await this.requestPermissions();
        if (!granted) {
          console.error('[LocationService] Permission denied');
          return false;
        }
      }
      
      // Configure BackgroundGeolocation with minimal settings
      const state = await BackgroundGeolocation.ready({
        // Geolocation Config
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10,
        
        // Application config
        debug: true, // Enable debug for troubleshooting
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        stopOnTerminate: false,
        startOnBoot: false,
        
        // Disable foreground service temporarily to avoid notification issues
        foregroundService: false,
        
        // Disable headless mode temporarily
        enableHeadless: false,
      });

      console.log('[LocationService] Configuration successful:', state);
      this.isConfigured = true;
      
      // Register location listener
      BackgroundGeolocation.onLocation(this.onLocation.bind(this), this.onLocationError.bind(this));
      
      return true;
    } catch (error) {
      console.error('[LocationService] Configuration error:', error);
      console.error('[LocationService] Error stack:', error.stack);
      return false;
    }
  }

  async start(driverId) {
    try {
      console.log('[LocationService] Starting tracking for driver:', driverId);
      
      if (!driverId) {
        console.error('[LocationService] No driverId provided');
        return false;
      }

      // Convert to string to ensure compatibility
      this.currentDriverId = String(driverId);
      
      // Check permissions before starting
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        console.error('[LocationService] No location permission');
        return false;
      }
      
      // Configure if not already configured
      if (!this.isConfigured) {
        console.log('[LocationService] Not configured, configuring now...');
        const configured = await this.configure();
        if (!configured) {
          console.error('[LocationService] Failed to configure');
          return false;
        }
      }

      // Start tracking
      console.log('[LocationService] Calling BackgroundGeolocation.start()...');
      await BackgroundGeolocation.start();
      
      this.isTracking = true;
      console.log('[LocationService] Tracking started successfully');
      
      // Update driver status in Firestore
      await this.updateDriverStatus(true);
      
      return true;
    } catch (error) {
      console.error('[LocationService] Start error:', error);
      console.error('[LocationService] Error stack:', error.stack);
      return false;
    }
  }

  async stop() {
    try {
      console.log('[LocationService] Stopping tracking...');
      
      await BackgroundGeolocation.stop();
      this.isTracking = false;
      
      // Update driver status in Firestore
      await this.updateDriverStatus(false);
      
      console.log('[LocationService] Tracking stopped');
      return true;
    } catch (error) {
      console.error('[LocationService] Stop error:', error);
      return false;
    }
  }

  async onLocation(location) {
    try {
      console.log('[LocationService] Location received:', location);
      
      if (!this.currentDriverId) {
        console.warn('[LocationService] No driver ID set, skipping location save');
        return;
      }

      // Save to Firestore
      await firestore()
        .collection('drivers')
        .doc(this.currentDriverId)
        .update({
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: location.coords.speed || 0,
            heading: location.coords.heading || 0,
          },
          lastUpdate: firestore.FieldValue.serverTimestamp(),
          isActive: true,
        });

      console.log('[LocationService] Location saved to Firestore');
    } catch (error) {
      console.error('[LocationService] Error saving location:', error);
    }
  }

  onLocationError(error) {
    console.error('[LocationService] Location error:', error);
  }

  async updateDriverStatus(isActive) {
    try {
      if (!this.currentDriverId) {
        return;
      }

      await firestore()
        .collection('drivers')
        .doc(this.currentDriverId)
        .update({
          isActive: isActive,
          lastUpdate: firestore.FieldValue.serverTimestamp(),
        });

      console.log('[LocationService] Driver status updated:', isActive);
    } catch (error) {
      console.error('[LocationService] Error updating driver status:', error);
    }
  }

  async getCurrentPosition() {
    try {
      const location = await BackgroundGeolocation.getCurrentPosition({
        timeout: 30,
        maximumAge: 5000,
        desiredAccuracy: 10,
        samples: 1,
      });
      
      return location;
    } catch (error) {
      console.error('[LocationService] Error getting current position:', error);
      return null;
    }
  }

  getState() {
    return {
      isConfigured: this.isConfigured,
      isTracking: this.isTracking,
      currentDriverId: this.currentDriverId,
    };
  }
}

export default new LocationService();

