import BackgroundGeolocation from 'react-native-background-geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { ToastAndroid } from 'react-native';

class LocationService {
  constructor() {
    this.isConfigured = false;
  }

  // تهيئة الخدمة
  async configure() {
    if (this.isConfigured) {
      console.log('🔵 LocationService already configured');
      return;
    }

    try {
      console.log('🔵 Configuring LocationService with Transistor SDK...');

      // الحصول على driverId من AsyncStorage
      const driverId = await AsyncStorage.getItem('driverId');
      const userId = await AsyncStorage.getItem('userId');

      console.log('📍 Retrieved from AsyncStorage:', { driverId, userId });
      // ToastAndroid.show(`Driver ID: ${driverId || 'Not found'}`, ToastAndroid.LONG);

      if (!driverId) {
        console.error('❌ No driverId found in AsyncStorage');
        // ToastAndroid.show('❌ خطأ: لم يتم العثور على معرف السائق', ToastAndroid.LONG);
        return;
      }

      // تهيئة BackgroundGeolocation
      await BackgroundGeolocation.ready({
        // Geolocation Config
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10, // متر - يحدث الموقع كل 10 متر
        stationaryRadius: 25,
        
        // Activity Recognition
        stopTimeout: 5, // دقائق
        
        // Application config
        debug: false, // تعطيل debug في production
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        stopOnTerminate: false, // الاستمرار حتى بعد إغلاق التطبيق
        startOnBoot: true, // البدء تلقائياً عند إعادة تشغيل الجهاز
        
        // HTTP / SQLite config
        autoSync: false, // لا نستخدم HTTP posting
        
        // Geofencing
        geofenceProximityRadius: 1000,
        
        // Android specific
        foregroundService: true,
        enableHeadless: true,
        notification: {
          title: 'البرنامج نشط',
          text: 'التطبيق يعمل في الخلفية',
          color: '#4CAF50',
          channelName: 'Location Tracking',
          smallIcon: 'mipmap/ic_launcher',
          largeIcon: 'mipmap/ic_launcher',
        },
        
        // iOS specific (للمستقبل)
        preventSuspend: true,
        heartbeatInterval: 60,
      });
      
      console.log('✅ BackgroundGeolocation is configured and ready');
      this.isConfigured = true;

      // الاستماع لتحديثات الموقع
      BackgroundGeolocation.onLocation(async (location) => {
        console.log('📍 Location received:', location);
        // ToastAndroid.show(`📍 موقع جديد: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`, ToastAndroid.SHORT);
        
        await this.updateLocationInFirebase(driverId, location);
      }, (error) => {
        console.error('❌ Location error:', error);
        // ToastAndroid.show(`❌ خطأ في الموقع: ${error}`, ToastAndroid.LONG);
      });

      // الاستماع لتغيرات الحركة
      BackgroundGeolocation.onMotionChange((event) => {
        console.log('🚗 Motion change:', event);
      });

      // الاستماع لتغيرات الحالة
      BackgroundGeolocation.onProviderChange((provider) => {
        console.log('⚙️ Provider change:', provider);
        
        if (!provider.gps) {
          console.warn('⚠️ GPS is not enabled');
          // ToastAndroid.show('⚠️ تحذير: GPS غير مفعل!', ToastAndroid.LONG);
        }
        
        if (!provider.enabled) {
          console.warn('⚠️ Location service is disabled');
          // ToastAndroid.show('⚠️ تحذير: خدمة الموقع معطلة!', ToastAndroid.LONG);
        }
      });

      // الاستماع للأخطاء
      BackgroundGeolocation.onHeartbeat((event) => {
        console.log('💓 Heartbeat:', event);
      });

      console.log('✅ LocationService configured successfully');
      // ToastAndroid.show('✅ تم تفعيل خدمة التتبع بنجاح', ToastAndroid.LONG);

    } catch (error) {
      console.error('❌ Error configuring LocationService:', error);
      console.error('❌ Error stack:', error.stack);
      // ToastAndroid.show(`❌ خطأ في تفعيل الخدمة: ${error.message}`, ToastAndroid.LONG);
    }
  }

  // بدء التتبع
  async start(driverId) {
    try {
      console.log('🔵 Starting location tracking for driver:', driverId);

      if (!driverId) {
        console.error('❌ No driverId provided');
        return false;
      }

      // حفظ driverId في AsyncStorage
      await AsyncStorage.setItem('driverId', String(driverId));
      console.log('✅ Saved driverId to AsyncStorage:', driverId);

      // تهيئة الخدمة إذا لم تكن مهيأة
      if (!this.isConfigured) {
        console.log('🔵 Configuring service first...');
        await this.configure();
      }

      // بدء التتبع مع معالجة أفضل للأخطاء
      try {
        const state = await BackgroundGeolocation.start();
        console.log('✅ Location tracking started successfully');
        console.log('📊 State:', state);
        
        // Don't show toast to avoid UI interruption
        // ToastAndroid.show('✅ تم بدء التتبع بنجاح', ToastAndroid.SHORT);
        
        return true;
      } catch (startError) {
        console.error('❌ Error calling BackgroundGeolocation.start():', startError);
        console.error('❌ Error details:', JSON.stringify(startError));
        
        // Don't throw, just return false
        return false;
      }
    } catch (error) {
      console.error('❌ Error in start() method:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Don't show any UI that might crash the app
      return false;
    }
  }

  // إيقاف التتبع
  async stop() {
    try {
      console.log('🔵 Stopping location tracking...');
      
      await BackgroundGeolocation.stop();
      
      console.log('✅ Location tracking stopped');
      // ToastAndroid.show('✅ تم إيقاف التتبع', ToastAndroid.SHORT);
      
      return true;
    } catch (error) {
      console.error('❌ Error stopping location tracking:', error);
      // ToastAndroid.show(`❌ خطأ في إيقاف التتبع: ${error.message}`, ToastAndroid.LONG);
      return false;
    }
  }

  // الحصول على الحالة الحالية
  async getState() {
    try {
      const state = await BackgroundGeolocation.getState();
      console.log('📊 Current state:', state);
      return state;
    } catch (error) {
      console.error('❌ Error getting state:', error);
      return null;
    }
  }

  // تحديث الموقع في Firestore
  async updateLocationInFirebase(driverId, location) {
    try {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('📤 UPDATE_FIREBASE: Starting update...');
      console.log('📍 Driver ID:', driverId);
      console.log('📍 Location:', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed,
        heading: location.coords.heading,
        timestamp: location.timestamp,
      });

      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || 0,
        timestamp: new Date(location.timestamp),
        lastUpdate: new Date(),
        isActive: true,
        battery: location.battery ? {
          level: location.battery.level,
          is_charging: location.battery.is_charging,
        } : null,
      };

      console.log('📤 Updating Firestore document:', `driverLocations/${driverId}`);
      console.log('📤 Data:', locationData);

      await firestore()
        .collection('driverLocations')
        .doc(driverId)
        .set(locationData, { merge: true });

      console.log('✅ UPDATE_FIREBASE: Successfully updated!');
      // ToastAndroid.show('✅ تم حفظ الموقع بنجاح', ToastAndroid.SHORT);
      console.log('═══════════════════════════════════════════════════════════════');

    } catch (error) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('❌ UPDATE_FIREBASE: Error updating location!');
      console.error('❌ Error details:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('═══════════════════════════════════════════════════════════════');
      
      // ToastAndroid.show(`❌ خطأ في حفظ الموقع: ${error.message}`, ToastAndroid.LONG);
    }
  }

  // تنظيف الموارد
  async cleanup() {
    try {
      console.log('🔵 Cleaning up LocationService...');
      
      // إزالة جميع المستمعين
      BackgroundGeolocation.removeListeners();
      
      console.log('✅ LocationService cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up LocationService:', error);
    }
  }
}

export default new LocationService();

