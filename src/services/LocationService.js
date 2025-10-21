
import BackgroundActions from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform, AppState, ToastAndroid } from 'react-native';

class LocationService {
  static isRunning = false;
  static watchId = null;
  static intervalId = null;
  static lastLocation = null;
  static updateCount = 0;

  // طلب صلاحيات الموقع
  static async requestLocationPermission() {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'صلاحية الموقع',
            message: 'التطبيق يحتاج للوصول إلى موقعك لتتبع رحلاتك',
            buttonNeutral: 'اسألني لاحقاً',
            buttonNegative: 'إلغاء',
            buttonPositive: 'موافق',
          }
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          // Request background location permission (Android 10+)
          if (Platform.Version >= 29) {
            const backgroundGranted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {
                title: 'صلاحية الموقع في الخلفية',
                message: 'للتتبع المستمر، نحتاج صلاحية الوصول للموقع في الخلفية',
                buttonNeutral: 'اسألني لاحقاً',
                buttonNegative: 'إلغاء',
                buttonPositive: 'موافق',
              }
            );
            return backgroundGranted === PermissionsAndroid.RESULTS.GRANTED;
          }
          return true;
        }
        return false;
      } catch (err) {
        console.warn('Permission error:', err);
        return false;
      }
    }
    return true;
  }

  // طلب صلاحية الإشعارات (Android 13+)
  static async requestNotificationPermission() {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'صلاحية الإشعارات',
            message: 'التطبيق يحتاج صلاحية الإشعارات لعرض حالة التتبع في شريط الإشعارات',
            buttonNeutral: 'اسألني لاحقاً',
            buttonNegative: 'إلغاء',
            buttonPositive: 'موافق',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Notification permission error:', err);
        return false;
      }
    }
    // For Android < 13, notifications are granted by default
    return true;
  }

  // التحقق من صلاحية الإشعارات
  static async checkNotificationPermission() {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return granted;
      } catch (err) {
        console.warn('Error checking notification permission:', err);
        return false;
      }
    }
    // For Android < 13, assume granted
    return true;
  }

  // تحديث الموقع في Firebase
  static async updateLocationInFirebase(driverId, latitude, longitude, speed, heading) {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 UPDATE_FIREBASE: START');
      console.log('📍 UPDATE_FIREBASE: driverId parameter:', driverId);
      console.log('📍 UPDATE_FIREBASE: latitude:', latitude);
      console.log('📍 UPDATE_FIREBASE: longitude:', longitude);
      console.log('📍 UPDATE_FIREBASE: speed:', speed);
      console.log('📍 UPDATE_FIREBASE: heading:', heading);
      
      const userId = await AsyncStorage.getItem('userId');
      console.log('📍 UPDATE_FIREBASE: userId from AsyncStorage:', userId);
      
      const driverNumber = driverId; // <-- DRV001
      console.log('📍 UPDATE_FIREBASE: driverNumber (final):', driverNumber);
      console.log('📍 UPDATE_FIREBASE: driverNumber type:', typeof driverNumber);
      
      if (!driverNumber) {
        console.log('❌ FATAL: driverId not found in AsyncStorage. Cannot update location.');
        return;
      }

      console.log(`📍 Updating location for driver: ${driverNumber}`);

      const locationData = {
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: new Date(),
        lastUpdate: new Date().toISOString(),
        appState: AppState.currentState,
        updateCount: ++LocationService.updateCount,
      };

      // تحديث الموقع في مستند السائق في users collection (إذا كان userId موجود)
      if (userId) {
        await firestore()
          .collection('users')
          .doc(userId)
          .update({
            location: locationData,
            lastSeen: new Date(),
            isActive: true,
          });
      }

      // تحديث في driverLocations (للتتبع المباشر) - هذا هو الجزء الأهم!
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📤 WRITING TO FIRESTORE driverLocations...');
      console.log('📤 Collection: driverLocations');
      console.log('📤 Document ID:', driverNumber);
      console.log('📤 Data to write:', {
        driverId: driverNumber,
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        accuracy: 0,
        timestamp: new Date().toISOString(),
        localTime: new Date().toISOString(),
      });
      
      const writeResult = await firestore()
        .collection('driverLocations')
        .doc(driverNumber) // <-- الاستخدام المباشر لـ DRV001
        .set({
          driverId: driverNumber,
          latitude,
          longitude,
          speed: speed || 0,
          heading: heading || 0,
          accuracy: 0, // يمكنك تحسين هذا لاحقاً
          timestamp: new Date(),
          localTime: new Date().toISOString(),
        });
      
      console.log('✅✅✅ driverLocations WRITE SUCCESS!');
      console.log('✅ Write result:', writeResult);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // حفظ في سجل المواقع
      await firestore()
        .collection('locationHistory')
        .add({
          userId: userId || driverNumber,
          driverId: driverNumber,
          ...locationData,
        });

      LocationService.lastLocation = { latitude, longitude };
      console.log(`✅ Location updated successfully (count: ${LocationService.updateCount})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌❌❌ ERROR in updateLocationInFirebase!');
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Full error:', JSON.stringify(error, null, 2));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Toast notification للخطأ
      ToastAndroid.show(`❌ خطأ في حفظ الموقع: ${error.message}`, ToastAndroid.LONG);
    }
  }

  // الحصول على الموقع وتحديثه
  static async fetchAndUpdateLocation(driverId) {
    try {
      const position = await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (error) => reject(error),
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
            forceRequestLocation: true,
          }
        );
      });

      const { latitude, longitude, speed, heading } = position.coords;
      
      console.log('Fetched location:', { latitude, longitude });
      
      await LocationService.updateLocationInFirebase(driverId, 
        latitude,
        longitude,
        speed,
        heading
      );
    } catch (error) {
      console.error('Error fetching location:', error);
    }
  }

  // مهمة الخلفية
  static backgroundTask = async (taskData) => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔵🔵🔵 BACKGROUND_TASK: STARTED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔵 BACKGROUND_TASK: taskData received:', JSON.stringify(taskData));
    console.log('🔵 BACKGROUND_TASK: taskData.parameters:', JSON.stringify(taskData?.parameters));
    
    // قراءة driverId من AsyncStorage مباشرة (بدلاً من taskData)
    console.log('🔵 BACKGROUND_TASK: Reading driverId from AsyncStorage...');
    const driverId = await AsyncStorage.getItem('driverId');
    console.log('🔵 BACKGROUND_TASK: driverId from AsyncStorage:', driverId);
    console.log('🔵 BACKGROUND_TASK: driverId type:', typeof driverId);
    console.log('🔵 BACKGROUND_TASK: driverId length:', driverId?.length);
    
    if (!driverId) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('❌❌❌ BACKGROUND_TASK: FATAL ERROR - driverId is null or undefined!');
      console.error('❌ BACKGROUND_TASK: Cannot proceed with location tracking!');
      console.error('❌ BACKGROUND_TASK: Check if driverId was saved during login!');
      console.error('═══════════════════════════════════════════════════════════════');
      return;
    }
    
    console.log('✅ BACKGROUND_TASK: driverId found:', driverId);
    console.log('═══════════════════════════════════════════════════════════════');
    
    await new Promise(async (resolve) => {
      const hasPermission = await LocationService.requestLocationPermission();
      
      if (!hasPermission) {
        console.log('Location permission not granted');
        return;
      }

      console.log('Background task started');

      // watchPosition للتحديثات التلقائية
      LocationService.watchId = Geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed, heading } = position.coords;
          
          console.log('Watch position update:', { latitude, longitude });
          
          LocationService.updateLocationInFirebase(driverId, 
            latitude,
            longitude,
            speed,
            heading
          );
        },
        (error) => {
          console.error('Watch position error:', error);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10, // متر
          interval: 5000, // 5 ثواني
          fastestInterval: 3000, // 3 ثواني
          showLocationDialog: true,
          forceRequestLocation: true,
          forceLocationManager: false,
        }
      );

      // Interval للتحديثات الدورية (backup)
      LocationService.intervalId = setInterval(async () => {
        console.log('Interval update triggered');
        await LocationService.fetchAndUpdateLocation(driverId);
      }, 10000); // 10 ثواني

      // تحديث فوري عند البدء
      await LocationService.fetchAndUpdateLocation(driverId);
    });
  };

  // بدء خدمة التتبع
  static async start(driverId) {
    console.log('🔵 LOCATION_SERVICE: start() called');
    console.log('🔵 LOCATION_SERVICE: driverId received:', driverId);
    
    if (!driverId) {
      console.log('❌ LOCATION_SERVICE: FATAL ERROR - driverId is null or undefined!');
      throw new Error('معرف السائق غير موجود. لا يمكن بدء التتبع.');
    }
    
    if (LocationService.isRunning) {
      console.log('⚠️ Location service already running');
      return;
    }

    // التحقق من صلاحية الموقع
    console.log('🔑 Requesting location permission...');
    const hasLocationPermission = await LocationService.requestLocationPermission();
    
    if (!hasLocationPermission) {
      console.log('❌ Location permission not granted');
      throw new Error('صلاحية الموقع مرفوضة. الرجاء السماح بالوصول للموقع من إعدادات التطبيق.');
    }
    
    console.log('✅ Location permission granted');

    // التحقق من صلاحية الإشعارات
    console.log('🔔 Checking notification permission...');
    let hasNotificationPermission = await LocationService.checkNotificationPermission();
    
    if (!hasNotificationPermission) {
      console.log('⚠️ Notification permission not granted, requesting...');
      hasNotificationPermission = await LocationService.requestNotificationPermission();
      
      if (!hasNotificationPermission) {
        console.log('❌ Notification permission denied');
        throw new Error('NOTIFICATION_PERMISSION_DENIED');
      }
    }
    
    console.log('✅ Notification permission granted');

    console.log('🔵 LOCATION_SERVICE: Creating options with driverId:', driverId);
    
    const options = {
      taskName: 'تطبيق التاكسي',
      taskTitle: 'البرنامج نشط',
      taskDesc: 'التطبيق يعمل في الخلفية',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#FFC107',
      linkingURI: 'taxidriver://tracking',
      parameters: {
        delay: 5000,
        driverId: driverId, // <-- تمرير driverId إلى مهمة الخلفية
      },
    };
    
    console.log('🔵 LOCATION_SERVICE: options.parameters:', JSON.stringify(options.parameters));

    try {
      console.log('🚀 Starting BackgroundActions...');
      await BackgroundActions.start(LocationService.backgroundTask, options);
      LocationService.isRunning = true;
      LocationService.updateCount = 0;
      console.log('✅ Location service started successfully');
      console.log('📢 Notification should be visible now');
    } catch (error) {
      console.error('❌ Error starting location service:', error);
      console.error('Error details:', JSON.stringify(error));
      throw error;
    }
  }

  // إيقاف خدمة التتبع
  static async stop() {
    console.log('Stopping location service...');
    if (LocationService.isRunning) {
      await BackgroundActions.stop();
      if (LocationService.watchId !== null) {
        Geolocation.clearWatch(LocationService.watchId);
        LocationService.watchId = null;
      }
      if (LocationService.intervalId) {
        clearInterval(LocationService.intervalId);
        LocationService.intervalId = null;
      }
      LocationService.isRunning = false;
      console.log('Location service stopped');
    }
  }
}

export default LocationService;

