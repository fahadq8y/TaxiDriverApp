// import BackgroundGeolocation from 'react-native-background-geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { PermissionsAndroid, Platform } from 'react-native';

class LocationService {
  constructor() {
    this.isConfigured = false;
    this.currentDriverId = null;
  }

  // فحص الصلاحيات
  async checkPermissions() {
    try {
      console.log('🔵 Checking location permissions...');
      
      if (Platform.OS === 'android') {
        const fineLocation = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        
        const backgroundLocation = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
        );
        
        console.log('📍 Fine Location:', fineLocation);
        console.log('📍 Background Location:', backgroundLocation);
        
        return fineLocation && backgroundLocation;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error checking permissions:', error);
      return false;
    }
  }

  // تهيئة الخدمة
  async configure(driverId) {
    if (this.isConfigured) {
      console.log('🔵 LocationService already configured');
      return true;
    }

    try {
      console.log('🔵 Configuring LocationService...');
      console.log('🔵 Driver ID:', driverId);

      this.currentDriverId = driverId;

      // فحص الصلاحيات أولاً
      const hasPermissions = await this.checkPermissions();
      if (!hasPermissions) {
        console.log('⚠️ Missing location permissions (but continuing)');
      }

      // ✅ DISABLED: BackgroundGeolocation.ready() to test
      console.log('✅ LocationService configured (BackgroundGeolocation DISABLED for testing)');
      this.isConfigured = true;

      return true;
    } catch (error) {
      console.error('❌ Error configuring LocationService:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      return false;
    }
  }

  // بدء التتبع
  async start(driverId) {
    try {
      console.log('🚀 Starting location tracking...');
      console.log('🚀 Driver ID:', driverId);

      if (!driverId) {
        console.error('❌ No driverId provided');
        return false;
      }

      // حفظ driverId
      await AsyncStorage.setItem('driverId', String(driverId));
      this.currentDriverId = driverId;

      // تهيئة إذا لم تكن مهيأة
      if (!this.isConfigured) {
        console.log('🔵 Configuring before start...');
        const configured = await this.configure(driverId);
        if (!configured) {
          console.error('❌ Failed to configure');
          return false;
        }
      }

      // ✅ DISABLED: BackgroundGeolocation.start() to test
      console.log('✅ Location tracking started (BackgroundGeolocation DISABLED for testing)');
      console.log('✅ If you see this message, the app did NOT crash!');
      console.log('✅ This means the crash is caused by BackgroundGeolocation SDK');

      return true;
    } catch (error) {
      console.error('❌ Error starting location tracking:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      return false;
    }
  }

  // إيقاف التتبع
  async stop() {
    try {
      console.log('🔵 Stopping location tracking...');
      // ✅ DISABLED: BackgroundGeolocation.stop()
      console.log('✅ Location tracking stopped (BackgroundGeolocation DISABLED)');
      return true;
    } catch (error) {
      console.error('❌ Error stopping location tracking:', error);
      return false;
    }
  }

  // تحديث الموقع في Firestore
  async updateLocationInFirebase(location) {
    try {
      if (!this.currentDriverId) {
        console.error('❌ No driverId available');
        return;
      }

      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || 0,
        timestamp: new Date(location.timestamp),
        lastUpdate: new Date(),
        isActive: true,
      };

      console.log('📤 Updating Firebase:', this.currentDriverId);

      await firestore()
        .collection('driverLocations')
        .doc(this.currentDriverId)
        .set(locationData, { merge: true });

      console.log('✅ Firebase updated successfully');
    } catch (error) {
      console.error('❌ Error updating Firebase:', error);
    }
  }

  // تنظيف الموارد
  async cleanup() {
    try {
      console.log('🔵 Cleaning up LocationService...');
      // ✅ DISABLED: BackgroundGeolocation.removeListeners()
      console.log('✅ LocationService cleaned up (BackgroundGeolocation DISABLED)');
    } catch (error) {
      console.error('❌ Error cleaning up LocationService:', error);
    }
  }
}

export default new LocationService();

