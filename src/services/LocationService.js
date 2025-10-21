import BackgroundGeolocation from '@mauron85/react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ToastAndroid } from 'react-native';

class LocationService {
  static isRunning = false;
  static driverId = null;

  static async start(driverId) {
    try {
      console.log('🚀 Starting LocationService with driverId:', driverId);
      
      if (!driverId) {
        console.error('❌ No driverId provided!');
        ToastAndroid.show('❌ خطأ: لم يتم توفير معرف السائق', ToastAndroid.LONG);
        return;
      }

      // حفظ driverId
      this.driverId = driverId;
      await AsyncStorage.setItem('driverId', driverId);
      console.log('✅ Saved driverId to AsyncStorage:', driverId);

      // إعداد BackgroundGeolocation
      BackgroundGeolocation.configure({
        desiredAccuracy: BackgroundGeolocation.HIGH_ACCURACY,
        stationaryRadius: 10,
        distanceFilter: 10,
        notificationTitle: 'البرنامج نشط',
        notificationText: 'التطبيق يعمل في الخلفية',
        debug: false, // تعطيل debug في production
        startOnBoot: false,
        stopOnTerminate: false,
        locationProvider: BackgroundGeolocation.ACTIVITY_PROVIDER,
        interval: 10000, // 10 ثواني
        fastestInterval: 5000, // 5 ثواني
        activitiesInterval: 10000,
        stopOnStillActivity: false,
        notificationsEnabled: true,
        startForeground: true,
      });

      // الاستماع لتحديثات الموقع
      BackgroundGeolocation.on('location', (location) => {
        console.log('📍 Location received:', location);
        this.updateLocationInFirebase(location);
      });

      // الاستماع للأخطاء
      BackgroundGeolocation.on('error', (error) => {
        console.error('❌ BackgroundGeolocation error:', error);
        ToastAndroid.show(`❌ خطأ في الموقع: ${error.message}`, ToastAndroid.LONG);
      });

      // الاستماع لتغيير الحالة
      BackgroundGeolocation.on('stationary', (location) => {
        console.log('🛑 Stationary location:', location);
        this.updateLocationInFirebase(location);
      });

      // بدء الخدمة
      BackgroundGeolocation.start();
      this.isRunning = true;
      
      console.log('✅ LocationService started successfully');
      ToastAndroid.show('✅ تم بدء خدمة التتبع بنجاح', ToastAndroid.SHORT);
      
    } catch (error) {
      console.error('❌ Error starting LocationService:', error);
      ToastAndroid.show(`❌ خطأ في بدء الخدمة: ${error.message}`, ToastAndroid.LONG);
    }
  }

  static async stop() {
    try {
      console.log('🛑 Stopping LocationService...');
      
      BackgroundGeolocation.stop();
      BackgroundGeolocation.removeAllListeners();
      
      this.isRunning = false;
      this.driverId = null;
      
      console.log('✅ LocationService stopped successfully');
      ToastAndroid.show('✅ تم إيقاف خدمة التتبع', ToastAndroid.SHORT);
      
    } catch (error) {
      console.error('❌ Error stopping LocationService:', error);
      ToastAndroid.show(`❌ خطأ في إيقاف الخدمة: ${error.message}`, ToastAndroid.LONG);
    }
  }

  static async updateLocationInFirebase(location) {
    try {
      const driverId = this.driverId || await AsyncStorage.getItem('driverId');
      
      if (!driverId) {
        console.error('❌ No driverId found for updating location');
        return;
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📤 Updating location in Firebase for driver:', driverId);
      console.log('📍 Location:', {
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        accuracy: location.accuracy,
      });

      const locationData = {
        driverId: driverId,
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed || 0,
        heading: location.bearing || 0,
        accuracy: location.accuracy || 0,
        timestamp: new Date(),
        localTime: new Date().toISOString(),
      };

      // تحديث في driverLocations (للتتبع المباشر)
      await firestore()
        .collection('driverLocations')
        .doc(driverId)
        .set(locationData);

      console.log('✅ Location updated successfully in driverLocations');
      ToastAndroid.show(`✅ تم تحديث الموقع (${driverId})`, ToastAndroid.SHORT);

      // حفظ في سجل المواقع
      await firestore()
        .collection('locationHistory')
        .add({
          ...locationData,
          timestamp: new Date(),
        });

      console.log('✅ Location saved to history');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ Error updating location in Firebase:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      ToastAndroid.show(`❌ خطأ في حفظ الموقع: ${error.message}`, ToastAndroid.LONG);
    }
  }

  static async checkStatus() {
    return {
      isRunning: this.isRunning,
      driverId: this.driverId,
    };
  }
}

export default LocationService;

