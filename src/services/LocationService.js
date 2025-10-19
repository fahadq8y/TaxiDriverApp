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
        appState: AppState.currentState, // إضافة حالة التطبيق
        updateCount: ++LocationService.updateCount, // عداد التحديثات
      };

      // تحديث الموقع في مستند السائق في users collection
      await firestore()
        .collection('users')
        .doc(userDocId)
        .update({
          location: locationData,
          lastSeen: firestore.FieldValue.serverTimestamp(),
          isActive: true, // تعيين السائق كنشط
        });

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

  // الحصول على الموقع وتحديثه (يعمل حتى لو watchPosition توقف)
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

  // مهمة الخلفية المحسّنة
  static backgroundTask = async (taskData) => {
    await new Promise(async (resolve) => {
      const hasPermission = await LocationService.requestLocationPermission();
      
      if (!hasPermission) {
        console.log('Location permission not granted');
        return;
      }

      console.log('Background task started');

      // الطريقة 1: watchPosition للتحديثات التلقائية
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
          distanceFilter: 10, // تحديث كل 10 متر
          interval: 5000, // تحديث كل 5 ثواني
          fastestInterval: 3000,
          showLocationDialog: true,
          forceRequestLocation: true,
          forceLocationManager: false,
        }
      );

      // الطريقة 2: Interval للتحديثات الدورية (backup)
      // هذا يضمن التحديث حتى لو watchPosition توقف
      LocationService.intervalId = setInterval(async () => {
        console.log('Interval update triggered');
        await LocationService.fetchAndUpdateLocation();
      }, 10000); // كل 10 ثواني

      // تحديث فوري عند البدء
      await LocationService.fetchAndUpdateLocation();
    });
  };

  // بدء خدمة التتبع
  static async start() {
    if (LocationService.isRunning) {
      console.log('Location service already running');
      return;
    }

    const hasPermission = await LocationService.requestLocationPermission();
    
    if (!hasPermission) {
      console.log('Location permission not granted');
      throw new Error('Location permission not granted');
    }

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
      await BackgroundActions.start(LocationService.backgroundTask, options);
      LocationService.isRunning = true;
      LocationService.updateCount = 0;
      console.log('Location service started successfully');
    } catch (error) {
      console.error('Error starting location service:', error);
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

