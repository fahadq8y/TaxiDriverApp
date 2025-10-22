import BackgroundGeolocation from 'react-native-background-geolocation';
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
        console.error('❌ Missing location permissions');
        return false;
      }

      // تهيئة بسيطة جداً - بدون notification
      const state = await BackgroundGeolocation.ready({
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10,
        stopOnTerminate: false,
        startOnBoot: false, // تعطيل البدء التلقائي
        debug: false,
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        foregroundService: false, // تعطيل foreground service مؤقتاً
      });

      console.log('✅ BackgroundGeolocation configured');
      console.log('📊 Initial state:', state);
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

      // فحص الحالة الحالية
      const state = await BackgroundGeolocation.getState();
      console.log('📊 Current state before start:', state);

      // بدء التتبع
      console.log('🔵 Calling BackgroundGeolocation.start()...');
      await BackgroundGeolocation.start();
      console.log('✅ Location tracking started successfully');

      // التحقق من الحالة بعد البدء
      const newState = await BackgroundGeolocation.getState();
      console.log('📊 State after start:', newState);

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

