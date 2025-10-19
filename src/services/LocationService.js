import BackgroundActions from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';

class LocationService {
  static isRunning = false;
  static watchId = null;

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
      };

      // تحديث الموقع في مستند السائق في users collection
      await firestore()
        .collection('users')
        .doc(userDocId)
        .update({
          location: locationData,
          lastSeen: firestore.FieldValue.serverTimestamp(),
        });

      // حفظ في سجل المواقع
      await firestore()
        .collection('locationHistory')
        .add({
          userId: userDocId,
          driverId: driverNumber || userDocId, // استخدام driverNumber (DRV001) بدلاً من Document ID
          ...locationData,
        });

      console.log('Location updated successfully');
    } catch (error) {
      console.error('Error updating location:', error);
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

      // تتبع الموقع بشكل مستمر
      LocationService.watchId = Geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed, heading } = position.coords;
          
          console.log('New location:', { latitude, longitude });
          
          // تحديث الموقع في Firebase
          LocationService.updateLocationInFirebase(
            latitude,
            longitude,
            speed,
            heading
          );
        },
        (error) => {
          console.error('Location error:', error);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10, // تحديث كل 10 متر
          interval: 5000, // تحديث كل 5 ثواني
          fastestInterval: 3000, // أسرع تحديث كل 3 ثواني
          showLocationDialog: true,
          forceRequestLocation: true,
          forceLocationManager: false,
        }
      );
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
      return;
    }

    const options = {
      taskName: 'تتبع الموقع',
      taskTitle: 'تتبع موقع السائق',
      taskDesc: 'جاري تتبع موقعك بشكل مستمر',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#2563eb',
      linkingURI: 'taxidriver://tracking',
      parameters: {
        delay: 5000,
      },
    };

    try {
      await BackgroundActions.start(LocationService.backgroundTask, options);
      LocationService.isRunning = true;
      console.log('Location service started');
    } catch (error) {
      console.error('Error starting location service:', error);
    }
  }

  // إيقاف خدمة التتبع
  static async stop() {
    if (!LocationService.isRunning) {
      console.log('Location service not running');
      return;
    }

    try {
      if (LocationService.watchId !== null) {
        Geolocation.clearWatch(LocationService.watchId);
        LocationService.watchId = null;
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
        }
      );
    });
  }
}

export default LocationService;

