import BackgroundGeolocation from 'react-native-background-geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';

class LocationService {
  constructor() {
    this.isConfigured = false;
    this.currentDriverId = null;
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

      // تهيئة بسيطة جداً
      await BackgroundGeolocation.ready({
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10,
        stopOnTerminate: false,
        startOnBoot: true,
        debug: false,
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        foregroundService: true,
        notification: {
          title: 'تتبع الموقع',
          text: 'التطبيق يعمل في الخلفية',
        },
      });

      console.log('✅ BackgroundGeolocation configured');
      this.isConfigured = true;

      // الاستماع لتحديثات الموقع
      BackgroundGeolocation.onLocation(
        (location) => {
          console.log('📍 Location received:', location.coords);
          this.updateLocationInFirebase(location);
        },
        (error) => {
          console.error('❌ Location error:', error);
        }
      );

      return true;
    } catch (error) {
      console.error('❌ Error configuring LocationService:', error);
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
        const configured = await this.configure(driverId);
        if (!configured) {
          console.error('❌ Failed to configure');
          return false;
        }
      }

      // بدء التتبع
      await BackgroundGeolocation.start();
      console.log('✅ Location tracking started');

      return true;
    } catch (error) {
      console.error('❌ Error starting location tracking:', error);
      console.error('❌ Error stack:', error.stack);
      return false;
    }
  }

  // إيقاف التتبع
  async stop() {
    try {
      console.log('🔵 Stopping location tracking...');
      await BackgroundGeolocation.stop();
      console.log('✅ Location tracking stopped');
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
      BackgroundGeolocation.removeListeners();
      console.log('✅ LocationService cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up LocationService:', error);
    }
  }
}

export default new LocationService();

