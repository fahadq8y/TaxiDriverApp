import BackgroundActions from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform, AppState } from 'react-native';

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
  static async updateLocationInFirebase(latitude, longitude, speed, heading) {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const driverId = await AsyncStorage.getItem('driverId');
      const userDocId = userId || driverId;
      
      if (!userDocId) {
        console.log('No user ID found');
        return;
      }

      // جلب بيانات السائق للحصول على driverId الصحيح
      let driverNumber = null;
      try {
        const userDoc = await firestore()
          .collection('users')
          .doc(userDocId)
          .get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          driverNumber = userData.driverId; // حقل driverId مثل "DRV001"
        }
      } catch (error) {
        console.error('Error fetching driver data:', error);
      }

      const locationData = {
        latitude,
        longitude,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: firestore.FieldValue.serverTimestamp(),
        lastUpdate: new Date().toISOString(),
        appState: AppState.currentState,
        updateCount: ++LocationService.updateCount,
      };

      // تحديث الموقع في مستند السائق في users collection
      await firestore()
        .collection('users')
        .doc(userDocId)
        .update({
          location: locationData,
          lastSeen: firestore.FieldValue.serverTimestamp(),
          isActive: true,
        });

      // تحديث في driverLocations (للتتبع المباشر)
      if (driverNumber) {
        await firestore()
          .collection('driverLocations')
          .doc(driverNumber)
          .set({
            driverId: driverNumber,
            latitude,
            longitude,
            speed: speed || 0,
            heading: heading || 0,
            accuracy: 0,
            timestamp: new Date(),
            localTime: new Date().toISOString(),
          });
      }

      // حفظ في سجل المواقع
      await firestore()
        .collection('locationHistory')
        .add({
          userId: userDocId,
          driverId: driverNumber || userDocId,
          ...locationData,
        });

      LocationService.lastLocation = { latitude, longitude };
      console.log(`Location updated successfully (${LocationService.updateCount})`);
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }

  // الحصول على الموقع وتحديثه
  static async fetchAndUpdateLocation() {
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
      
      await LocationService.updateLocationInFirebase(
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
          
          LocationService.updateLocationInFirebase(
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
          distanceFilter: 10,
          interval: 5000,
          fastestInterval: 3000,
          showLocationDialog: true,
          forceRequestLocation: true,
          forceLocationManager: false,
        }
      );

      // Interval للتحديثات الدورية (backup)
      LocationService.intervalId = setInterval(async () => {
        console.log('Interval update triggered');
        await LocationService.fetchAndUpdateLocation();
      }, 10000);

      // تحديث فوري عند البدء
      await LocationService.fetchAndUpdateLocation();
    });
  };

  // بدء خدمة التتبع
  static async start() {
    console.log('🔵 LocationService.start() called');
    
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

    const options = {
      taskName: 'تتبع الموقع',
      taskTitle: 'تتبع موقع السائق',
      taskDesc: 'جاري تتبع موقعك بشكل مستمر',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#FFC107',
      linkingURI: 'taxidriver://tracking',
      parameters: {
        delay: 5000,
      },
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: true,
      },
    };

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
    if (!LocationService.isRunning) {
      console.log('Location service not running');
      return;
    }

    try {
      // إيقاف watchPosition
      if (LocationService.watchId !== null) {
        Geolocation.clearWatch(LocationService.watchId);
        LocationService.watchId = null;
      }

      // إيقاف الـ interval
      if (LocationService.intervalId !== null) {
        clearInterval(LocationService.intervalId);
        LocationService.intervalId = null;
      }

      // تحديث حالة السائق كغير نشط
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          await firestore()
            .collection('users')
            .doc(userId)
            .update({
              isActive: false,
              lastSeen: firestore.FieldValue.serverTimestamp(),
            });
        }
      } catch (error) {
        console.error('Error updating driver status:', error);
      }

      await BackgroundActions.stop();
      LocationService.isRunning = false;
      console.log('Location service stopped');
    } catch (error) {
      console.error('Error stopping location service:', error);
    }
  }

  // الحصول على الموقع الحالي مرة واحدة
  static async getCurrentLocation() {
    const hasPermission = await LocationService.requestLocationPermission();
    
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve(position.coords);
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
          forceRequestLocation: true,
        }
      );
    });
  }

  // التحقق من حالة الخدمة
  static isServiceRunning() {
    return LocationService.isRunning;
  }

  // الحصول على آخر موقع
  static getLastLocation() {
    return LocationService.lastLocation;
  }
}

export default LocationService;

