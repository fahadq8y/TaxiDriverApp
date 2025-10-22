import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';

class LocationService {
  constructor() {
    this.isConfigured = false;
    this.isTracking = false;
    this.currentDriverId = null;
  }

  async configure() {
    if (this.isConfigured) {
      console.log('[LocationService] Already configured');
      return true;
    }

    try {
      console.log('[LocationService] Configuring BackgroundGeolocation...');
      
      const state = await BackgroundGeolocation.ready({
        // Geolocation Config
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10,
        stopTimeout: 5,
        
        // Activity Recognition
        stopDetectionDelay: 1,
        
        // Application config
        debug: false, // Set to true for debugging
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        stopOnTerminate: false,
        startOnBoot: false,
        
        // HTTP / SQLite config
        autoSync: true,
        maxDaysToPersist: 3,
        
        // Notification config (for foreground service)
        notification: {
          title: "تتبع الموقع",
          text: "التتبع نشط",
        },
        
        // Android-specific
        foregroundService: true,
        enableHeadless: true,
        
        // iOS-specific (ignored on Android)
        preventSuspend: true,
        heartbeatInterval: 60,
      });

      console.log('[LocationService] Configuration successful:', state);
      this.isConfigured = true;
      
      // Register location listener
      BackgroundGeolocation.onLocation(this.onLocation.bind(this), this.onLocationError.bind(this));
      
      return true;
    } catch (error) {
      console.error('[LocationService] Configuration error:', error);
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
      
      // Configure if not already configured
      if (!this.isConfigured) {
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

