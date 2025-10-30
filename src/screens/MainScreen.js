import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Alert,
  StatusBar,
  Text,
  TouchableOpacity,
  Platform,
  Linking,
  NativeModules,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import LocationService from '../services/LocationService';
import TrackingWatchdog from '../services/TrackingWatchdog';

const { PowerManagerModule, BatteryOptimization } = NativeModules;

const MainScreen = ({ navigation, route }) => {
  const [userId, setUserId] = useState(null);
  const [driverId, setDriverId] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [locationServiceStarted, setLocationServiceStarted] = useState(false);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const webViewRef = useRef(null);

  useEffect(() => {
    console.log('\n\n==============================================');
    console.log('🚀 HYBRID TRACKING v2.2.7 LOADED');
    console.log('==============================================\n');
    
    loadDriverData();
    
    // Setup FCM
    setupFCM();
    
    // فحص Battery Optimization بعد 5 ثواني
    setTimeout(() => {
      checkBatteryOptimization();
    }, 5000);

    // Handle back button
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => {
      backHandler.remove();
    };
  }, []);

  useEffect(() => {
    console.log('🔵 MAIN: useEffect triggered - driverId:', driverId, 'locationServiceStarted:', locationServiceStarted);
    
    // Start location tracking automatically after login
    if (driverId && !locationServiceStarted) {
      console.log('🟢 MAIN: Starting tracking with simplified service');
      console.log('🟢 MAIN: driverId value:', driverId);
      
      const initTracking = async () => {
        try {
          console.log('🟢 MAIN: Waiting 2 seconds for screen to render...');
          // Wait for screen to fully render
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('🟢 MAIN: Checking location permission...');
          // Check permissions before starting
          const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          
          console.log('🟢 MAIN: Has location permission:', hasPermission);
          
          if (hasPermission) {
            console.log('✅ MAIN: Permission granted, starting tracking...');
            const result = await startLocationTracking(driverId);
            console.log('🟢 MAIN: startLocationTracking result:', result);
          } else {
            console.log('⚠️ MAIN: No location permission, user must enable manually');
            Alert.alert(
              'تنبيه',
              'صلاحية الموقع غير ممنوحة. اضغط على "بدء التتبع" لمنح الصلاحية.',
              [{ text: 'حسناً' }]
            );
          }
        } catch (error) {
          console.error('❌ MAIN: Init tracking error:', error);
          console.error('❌ MAIN: Error message:', error.message);
          console.error('❌ MAIN: Error stack:', error.stack);
          Alert.alert(
            'خطأ',
            `حدث خطأ أثناء بدء التتبع التلقائي:\n\n${error.message}`,
            [{ text: 'حسناً' }]
          );
        }
      };
      
      initTracking();
    } else {
      console.log('🔴 MAIN: Skipping auto-start - driverId:', driverId, 'locationServiceStarted:', locationServiceStarted);
    }
  }, [driverId]);

  // Register FCM token when driverId becomes available
  useEffect(() => {
    const registerTokenWhenReady = async () => {
      if (driverId) {
        console.log('[FCM] driverId is now available, checking for FCM token...');
        await showAlert('🔄 useEffect', `driverId متوفر الآن: ${driverId}\nجاري البحث عن Token محفوظ...`);
        try {
          const token = await AsyncStorage.getItem('fcmToken');
          if (token) {
            console.log('[FCM] Found saved token, registering with driverId:', driverId);
            await showAlert('✅ تم العثور', `تم العثور على Token محفوظ!\n\nجاري التسجيل في Firestore لـ ${driverId}...`);
            const result = await registerFCMToken(driverId, token);
            if (result.success) {
              await showAlert('✅ اكتمل', `تم تسجيل Token في Firestore بنجاح!`);
            } else {
              await showAlert('❌ فشل التسجيل', `فشل تسجيل Token!\n\nError: ${result.error}\nCode: ${result.code}`);
            }
          } else {
            console.log('[FCM] No saved token yet, will register when setupFCM completes');
            await showAlert('⚠️ لا يوجد Token', 'لا يوجد Token محفوظ بعد.\nسيتم التسجيل عند اكتمال setupFCM');
          }
        } catch (error) {
          console.error('[FCM] Error registering token on driverId load:', error);
          await showAlert('❌ خطأ', `خطأ في تسجيل Token:\n${error.message}`);
        }
      }
    };
    
    registerTokenWhenReady();
  }, [driverId]);

  const loadDriverData = async () => {
    try {
      console.log('🔵 MAIN: Loading driver data from AsyncStorage...');
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedDriverName = await AsyncStorage.getItem('userName');
      const storedEmployeeNumber = await AsyncStorage.getItem('employeeNumber');
      
      console.log('🔵 MAIN: storedUserId:', storedUserId);
      console.log('🔵 MAIN: storedDriverName:', storedDriverName);
      console.log('🔵 MAIN: storedEmployeeNumber:', storedEmployeeNumber);
      
      if (storedUserId && storedEmployeeNumber) {
        console.log('✅ MAIN: Setting state with stored data');
        setUserId(storedUserId);
        setDriverId(storedEmployeeNumber); // استخدام employeeNumber مباشرة
        setDriverName(storedDriverName || '');
        console.log('🔵 MAIN: driverId set to employeeNumber:', storedEmployeeNumber);
        await showAlert('✅ driverId تم تحميله', `driverId: ${storedEmployeeNumber}\nالآن سيتم تفعيل useEffect لتسجيل Token`);
      } else if (route.params?.driverId) {
        setDriverId(route.params.driverId);
        setUserId(route.params.driverId);
        await showAlert('✅ driverId من params', `driverId: ${route.params.driverId}`);
      } else {
        // No driver data, go back to login
        await showAlert('❌ لا يوجد driverId', 'سيتم الرجوع لشاشة تسجيل الدخول');
        navigation.replace('Login');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading driver data:', error);
      Alert.alert(
        'خطأ في تحميل البيانات',
        'حدث خطأ أثناء تحميل بيانات السائق: ' + error.message,
        [{ text: 'حسناً', onPress: () => navigation.replace('Login') }]
      );
      setLoading(false);
    }
  };

  // Helper function to show alerts sequentially
  const showAlert = (title, message) => {
    return new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [{ text: 'موافق', onPress: () => resolve() }],
        { cancelable: false }
      );
    });
  };

  // Setup FCM for push notifications and wake-up
  const setupFCM = async () => {
    try {
      console.log('[FCM] Setting up FCM...');
      await showAlert('🔔 الخطوة 1', 'بدء إعداد FCM...');
      
      // Request permission (iOS only, Android auto-granted)
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      
      await showAlert('🔔 الخطوة 2', `حالة الصلاحية:\nStatus: ${authStatus}\nEnabled: ${enabled}`);
      
      if (enabled) {
        console.log('[FCM] Permission granted');
        
        // Get FCM token
        await showAlert('🔔 الخطوة 3', 'جاري الحصول على FCM token...');
        const token = await messaging().getToken();
        console.log('[FCM] Token:', token);
        
        if (token) {
          await showAlert('✅ الخطوة 4', `تم الحصول على Token!\n\nToken: ${token.substring(0, 50)}...\n\nLength: ${token.length}`);
        } else {
          await showAlert('❌ خطأ', 'Token is null or undefined!');
          return;
        }
        
        // Save token to AsyncStorage
        await AsyncStorage.setItem('fcmToken', token);
        await showAlert('💾 الخطوة 5', 'تم حفظ Token في AsyncStorage');
        
        // Register token with driver ID when available
        if (driverId) {
          await showAlert('📤 الخطوة 6', `جاري تسجيل Token لـ ${driverId}...`);
          const result = await registerFCMToken(driverId, token);
          if (result.success) {
            await showAlert('✅ الخطوة 7', `تم تسجيل Token بنجاح في Firestore لـ ${driverId}!`);
          } else {
            await showAlert('❌ فشل التسجيل', `فشل تسجيل Token في Firestore!\n\nError: ${result.error}\nCode: ${result.code}`);
          }
        } else {
          await showAlert('⚠️ تحذير', 'driverId غير متوفر الآن\nسيتم التسجيل لاحقاً عند تحميل driverId');
        }
      } else {
        console.log('[FCM] Permission denied');
        await showAlert('❌ خطأ', 'تم رفض صلاحية الإشعارات!');
        return;
      }
      
      // Listen for token refresh
      messaging().onTokenRefresh(async newToken => {
        console.log('[FCM] Token refreshed:', newToken);
        await AsyncStorage.setItem('fcmToken', newToken);
        if (driverId) {
          await registerFCMToken(driverId, newToken);
        }
      });
      
      // Handle foreground messages
      messaging().onMessage(async remoteMessage => {
        console.log('[FCM] Foreground message:', JSON.stringify(remoteMessage));
        
        if (remoteMessage.data?.type === 'wake_up') {
          console.log('[FCM] Wake-up push received in foreground');
          // Tracking should already be running, but check anyway
          if (!locationServiceStarted) {
            console.log('[FCM] Restarting tracking from foreground');
            await startLocationTracking(driverId);
          }
        }
      });
      
      console.log('[FCM] Setup complete');
      await showAlert('✅ اكتمل', 'اكتمل إعداد FCM بنجاح!');
    } catch (error) {
      console.error('[FCM] Setup error:', error);
      await showAlert('❌ خطأ فادح', `خطأ في إعداد FCM:\n\n${error.message}\n\nCode: ${error.code}`);
    }
  };
  
  // Register FCM token with driver in Firestore
  const registerFCMToken = async (driverId, token) => {
    try {
      console.log('[FCM] Registering token for driver:', driverId);
      console.log('[FCM] Token to register:', token.substring(0, 50) + '...');
      
      await firestore()
        .collection('drivers')
        .doc(driverId)
        .set({
          fcmToken: token,
          fcmTokenUpdatedAt: new Date(),
        }, { merge: true });
      
      console.log('[FCM] Token registered successfully');
      return { success: true };
    } catch (error) {
      console.error('[FCM] Failed to register token:', error);
      console.error('[FCM] Error code:', error.code);
      console.error('[FCM] Error message:', error.message);
      return { success: false, error: error.message, code: error.code };
    }
  };

  const checkBatteryOptimization = async () => {
    if (Platform.OS !== 'android' || !BatteryOptimization) {
      return;
    }
    
    try {
      console.log('🔋 Checking battery optimization status...');
      const isIgnoring = await BatteryOptimization.isIgnoringBatteryOptimizations();
      console.log('🔋 Battery optimization ignored:', isIgnoring);
      
      if (!isIgnoring) {
        // عرض dialog لطلب الاستثناء
        Alert.alert(
          'تحسين الأداء',
          'للحصول على أفضل أداء، يرجى السماح للتطبيق بالعمل في الخلفية بدون قيود.',
          [
            { text: 'لاحقاً', style: 'cancel' },
            { 
              text: 'السماح', 
              onPress: () => BatteryOptimization.requestIgnoreBatteryOptimizations()
            }
          ]
        );
      } else {
        console.log('✅ Battery optimization already disabled');
      }
    } catch (error) {
      console.error('❌ Error checking battery optimization:', error);
    }
  };
  
  const checkAndRequestBatteryOptimization = async () => {
    if (Platform.OS === 'android') {
      try {
        // فتح إعدادات Battery Optimization مباشرة
        Alert.alert(
          'تحسين الأداء',
          'للحصول على أفضل أداء للتطبيق، يجب تعطيل تحسين البطارية\n\nخطوات:\n1. اضغط "فتح الإعدادات"\n2. ابحث عن "البطارية" أو "Battery"\n3. اختر "تحسين البطارية" أو "Battery Optimization"\n4. ابحث عن التطبيق واختر "عدم التحسين" أو "Don\'t optimize"',
          [
            {
              text: 'إلغاء',
              style: 'cancel',
            },
            {
              text: 'فتح الإعدادات',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ]
        );
      } catch (error) {
        console.error('Error checking battery optimization:', error);
      }
    }
  };

  const startLocationTracking = async (currentDriverId) => {
    try {
      console.log('🚀 MAIN: Attempting to start location tracking...');
      console.log('🚀 MAIN: currentDriverId received:', currentDriverId);
      
      if (!currentDriverId) {
        console.log('❌ MAIN: ERROR - currentDriverId is null or undefined!');
        Alert.alert(
          'خطأ',
          'لم يتم العثور على معرف السائق. الرجاء تسجيل الدخول مرة أخرى.',
          [{ text: 'حسناً' }]
        );
        return false;
      }
      
      console.log('🚀 Attempting to start location tracking...');
      
      const started = await LocationService.start(currentDriverId);
      
      if (started) {
        setLocationServiceStarted(true);
        console.log('✅ Location tracking started successfully');
        
        // بدء Watchdog للمراقبة
        TrackingWatchdog.start();
        console.log('✅ Watchdog started');
        
        // بدء ForceTrackingService (Native Service)
        try {
          const { NativeModules } = require('react-native');
          if (Platform.OS === 'android') {
            NativeModules.DeviceEventManagerModule.invokeDefaultBackPressHandler();
            // Start ForceTrackingService
            const ForceTrackingModule = NativeModules.ForceTrackingModule;
            if (ForceTrackingModule) {
              await ForceTrackingModule.startService();
              console.log('✅ ForceTrackingService started');
            } else {
              console.log('⚠️ ForceTrackingModule not available (will be added in next build)');
            }
          }
        } catch (error) {
          console.log('⚠️ ForceTrackingService not available yet:', error.message);
        }
        
        // Send confirmation to WebView
        try {
          webViewRef.current?.injectJavaScript(`
            window.postMessage({
              type: 'TRACKING_STARTED',
              success: true
            }, '*');
            true;
          `);
        } catch (webViewError) {
          console.log('⚠️ Could not send message to WebView:', webViewError.message);
        }
        
        return true;
      } else {
        console.log('⚠️ Location tracking failed to start');
        Alert.alert(
          'فشل بدء التتبع',
          'لم يتم بدء خدمة التتبع. تحقق من:\n1. صلاحية الموقع ممنوحة\n2. خدمات الموقع مفعلة\n3. الاتصال بالإنترنت',
          [{ text: 'حسناً' }]
        );
        return false;
      }
    } catch (error) {
      console.error('❌ Error starting location tracking:', error);
      console.error('Error details:', JSON.stringify(error));
      
      // Show detailed error to user
      Alert.alert(
        'خطأ في بدء التتبع',
        `حدث خطأ أثناء بدء التتبع:\n\n${error.message || error.toString()}\n\nالرجاء التقاط صورة لهذه الرسالة وإرسالها للدعم الفني.`,
        [{ text: 'حسناً' }]
      );
      
      return false;
    }
  };

  const stopLocationTracking = async () => {
    try {
      console.log('🛑 MAIN: Attempting to stop location tracking...');
      
      const stopped = await LocationService.stop();
      
      if (stopped) {
        setLocationServiceStarted(false);
        console.log('✅ Location tracking stopped successfully');
        
        // Send confirmation to WebView
        try {
          webViewRef.current?.injectJavaScript(`
            window.postMessage({
              type: 'TRACKING_STOPPED',
              success: true
            }, '*');
            true;
          `);
        } catch (webViewError) {
          console.log('⚠️ Could not send message to WebView:', webViewError.message);
        }
        
        Alert.alert(
          'تم إيقاف التتبع',
          'تم إيقاف خدمة التتبع بنجاح',
          [{ text: 'حسناً' }]
        );
        
        return true;
      } else {
        Alert.alert(
          'فشل إيقاف التتبع',
          'لم يتم إيقاف خدمة التتبع',
          [{ text: 'حسناً' }]
        );
        return false;
      }
    } catch (error) {
      console.error('❌ Error stopping location tracking:', error);
      
      Alert.alert(
        'خطأ في إيقاف التتبع',
        `حدث خطأ أثناء إيقاف التتبع:\n\n${error.message || error.toString()}\n\nالرجاء التقاط صورة لهذه الرسالة وإرسالها للدعم الفني.`,
        [{ text: 'حسناً' }]
      );
      
      return false;
    }
  };

  const handleGetCurrentLocation = async () => {
    try {
      console.log('📍 MAIN: Getting current location...');
      
      const location = await LocationService.getCurrentPosition();
      
      if (location) {
        console.log('✅ Current location:', location.coords);
        
        // Send location to WebView
        try {
          webViewRef.current?.injectJavaScript(`
            window.postMessage({
              type: 'LOCATION_UPDATE',
              location: {
                latitude: ${location.coords.latitude},
                longitude: ${location.coords.longitude},
                accuracy: ${location.coords.accuracy || 0}
              }
            }, '*');
            true;
          `);
        } catch (webViewError) {
          console.log('⚠️ Could not send location to WebView:', webViewError.message);
        }
        
        Alert.alert(
          'الموقع الحالي',
          `خط العرض: ${location.coords.latitude.toFixed(6)}\nخط الطول: ${location.coords.longitude.toFixed(6)}\nالدقة: ${location.coords.accuracy?.toFixed(0) || 'غير معروف'} متر`,
          [{ text: 'حسناً' }]
        );
        
        return true;
      } else {
        Alert.alert(
          'فشل الحصول على الموقع',
          'لم يتم الحصول على الموقع الحالي. تحقق من:\n1. صلاحية الموقع ممنوحة\n2. خدمات الموقع مفعلة\n3. أنك في مكان مفتوح',
          [{ text: 'حسناً' }]
        );
        return false;
      }
    } catch (error) {
      console.error('❌ Error getting current location:', error);
      
      Alert.alert(
        'خطأ في الحصول على الموقع',
        `حدث خطأ أثناء الحصول على الموقع:\n\n${error.message || error.toString()}\n\nالرجاء التقاط صورة لهذه الرسالة وإرسالها للدعم الفني.`,
        [{ text: 'حسناً' }]
      );
      
      return false;
    }
  };

  const handleWebViewMessage = (event) => {
    try {
      console.log('📨 MAIN: Received message from WebView:', event.nativeEvent.data);
      
      const data = JSON.parse(event.nativeEvent.data);
      
      console.log('📨 MAIN: Parsed message:', data);
      
      switch (data.action) {
        case 'startTracking':
          console.log('📨 MAIN: WebView requested to start tracking');
          startLocationTracking(driverId);
          break;
          
        case 'stopTracking':
          console.log('⚠️ MAIN: stopTracking disabled for continuous tracking');
          // التتبع يجب أن يستمر - لا يمكن إيقافه من WebView
          console.log('⚠️ Tracking cannot be stopped from WebView for security');
          break;
          
        case 'getCurrentLocation':
          console.log('📨 MAIN: WebView requested current location');
          handleGetCurrentLocation();
          break;
          
        default:
          console.log('📨 MAIN: Unknown action from WebView:', data.action);
      }
    } catch (error) {
      console.error('❌ Error handling WebView message:', error);
      
      // Don't show alert for every message error - just log it
      console.log('⚠️ MAIN: Could not parse WebView message, might be from page itself');
    }
  };

  const handleBackPress = () => {
    // إذا كان في WebView، ارجع في WebView
    if (webViewRef.current && webViewRef.current.canGoBack && webViewRef.current.canGoBack()) {
      webViewRef.current.goBack();
      return true;
    }
    
    // إذا محاولة الخروج من التطبيق، امنعه
    // التتبع يجب أن يستمر - لا يمكن إغلاق التطبيق
    console.log('⚠️ MAIN: Back button pressed - preventing app exit');
    
    // عرض رسالة توضيحية
    Alert.alert(
      'تنبيه',
      'التطبيق يعمل في الخلفية.\n\nلا يمكن إغلاق التطبيق أثناء ساعات العمل.',
      [{ text: 'فهمت' }]
    );
    
    return true; // منع الخروج
  };

  const handleLogout = async () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد من تسجيل الخروج؟',
      [
        {
          text: 'إلغاء',
          style: 'cancel',
        },
        {
          text: 'تسجيل الخروج',
          onPress: async () => {
            try {
              console.log('🔵 LOGOUT: Starting logout process...');
              
              // التحقق من حالة التتبع
              const trackingState = LocationService.getState();
              console.log('🔵 LOGOUT: Current tracking state:', trackingState);
              
              // إذا كان التتبع متوقف، أعد تشغيله
              if (!trackingState.isTracking && driverId) {
                console.log('⚠️ LOGOUT: Tracking stopped! Restarting...');
                try {
                  await LocationService.start(driverId);
                  console.log('✅ LOGOUT: Tracking restarted successfully');
                } catch (restartError) {
                  console.error('❌ LOGOUT: Failed to restart tracking:', restartError);
                  // استمر في تسجيل الخروج حتى لو فشلت إعادة التشغيل
                }
              } else {
                console.log('✅ LOGOUT: Services are running');
              }
              
              // مسح بيانات تسجيل الدخول فقط
              await AsyncStorage.removeItem('persistentLogin');
              await AsyncStorage.removeItem('userId');
              await AsyncStorage.removeItem('userName');
              await AsyncStorage.removeItem('userRole');
              
              // ✅ الاحتفاظ بـ employeeNumber للتتبع المستمر
              const employeeNumber = await AsyncStorage.getItem('employeeNumber');
              console.log('✅ LOGOUT: employeeNumber preserved:', employeeNumber);
              
              console.log('✅ LOGOUT: Logout complete');
              
              // عرض رسالة تأكيد
              Alert.alert(
                'تم تسجيل الخروج',
                'تم تسجيل خروجك بنجاح',
                [{ text: 'حسناً', onPress: () => navigation.replace('Login') }]
              );
            } catch (error) {
              console.error('❌ LOGOUT: Error during logout:', error);
              // استمر في تسجيل الخروج حتى لو حدث خطأ
              navigation.replace('Login');
            }
          },
        },
      ]
    );
  };

  // JavaScript code to inject into WebView
  const getInjectedJavaScript = () => {
    return `
      (function() {
        try {
          // Set driver data in sessionStorage (driver-view.html uses sessionStorage)
          sessionStorage.setItem('driverId', '${driverId}');
          
          console.log('Driver data injected successfully - driverId: ${driverId}');
          
          // Reload the page to apply changes
          if (!window.location.href.includes('reload=1')) {
            window.location.href = window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'reload=1';
          }
        } catch (error) {
          console.error('Error injecting driver data:', error);
        }
      })();
      true;
    `;
  };

  const handleWebViewLoad = () => {
    setWebViewLoaded(true);
    console.log('WebView loaded successfully');
  };

  const handleWebViewError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView error: ', nativeEvent);
    
    Alert.alert(
      'خطأ في التحميل',
      `حدث خطأ أثناء تحميل الصفحة:\n\n${nativeEvent.description || 'خطأ غير معروف'}\n\nالرجاء التحقق من الاتصال بالإنترنت`,
      [
        { text: 'إعادة المحاولة', onPress: () => webViewRef.current?.reload() },
        { text: 'إلغاء', style: 'cancel' }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFC107" />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  // driverId الآن يحتوي على employeeNumber (DRV001)
  const webViewUrl = `https://test-taxi-knpc.vercel.app/driver-view.html?driverId=${driverId}`;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#FFC107" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>🚖 نظام تتبع السائقين</Text>
            {driverName ? (
              <Text style={styles.headerSubtitle}>مرحباً، {driverName}</Text>
            ) : null}
            <Text style={styles.versionText}>v2.2.7</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>خروج</Text>
          </TouchableOpacity>
        </View>

        {/* WebView */}
        <WebView
          ref={webViewRef}
          source={{ uri: webViewUrl }}
          style={styles.webview}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webviewLoadingContainer}>
              <ActivityIndicator size="large" color="#FFC107" />
              <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
            </View>
          )}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={false}
          injectedJavaScript={getInjectedJavaScript()}
          onLoad={handleWebViewLoad}
          onError={handleWebViewError}
          onLoadStart={() => console.log('WebView loading started')}
          onLoadEnd={() => console.log('WebView loading ended')}
          onMessage={handleWebViewMessage}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    backgroundColor: '#FFC107',
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginTop: 2,
    textAlign: 'right',
  },
  versionText: {
    fontSize: 10,
    color: '#fff',
    opacity: 0.7,
    marginTop: 4,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  webviewLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6b7280',
  },
});

export default MainScreen;

