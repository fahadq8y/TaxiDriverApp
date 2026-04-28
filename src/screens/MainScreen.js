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
  AppState,
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import LocationService from '../services/LocationService';
import TrackingWatchdog from '../services/TrackingWatchdog';
import UpdateChecker from '../services/UpdateChecker';
import DeviceInfo from 'react-native-device-info';

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
    console.log('🚀 DRIVER MANAGEMENT APP LOADED');
    console.log('==============================================\n');
    
    loadDriverData();
    
    // Setup FCM
    setupFCM();
    
    // فحص التحديثات عند فتح التطبيق
    setTimeout(() => {
      UpdateChecker.checkForUpdates();
    }, 3000);
    
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

  // Session management - check every minute
  useEffect(() => {
    const checkSession = async () => {
      try {
        // 1. قراءة Session المحلي
        let localSession = await AsyncStorage.getItem('sessionId');
        
        // 2. إذا لم يوجد Session محلي، إنشاء واحد جديد
        if (!localSession && userId) {
          console.log('📱 No session found - Creating new session');
          
          // توليد Session ID فريد
          localSession = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // حفظه محلياً
          await AsyncStorage.setItem('sessionId', localSession);
          
          // حفظه في Firestore مع رقم الإصدار
          await firestore()
            .collection('users')
            .doc(userId)
            .update({
              currentSession: {
                sessionId: localSession,
                deviceInfo: `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
                appVersion: DeviceInfo.getVersion(),
                loginTime: Date.now(),
                lastActive: Date.now()
              }
            });
          
          // حفظ appVersion في drivers collection أيضاً
          if (driverId) {
            await firestore()
              .collection('drivers')
              .doc(driverId)
              .update({
                appVersion: DeviceInfo.getVersion()
              });
          }          
          console.log('✅ New session created:', localSession);
          return;
        }
        
        // 3. إذا يوجد Session، التحقق منه
        if (localSession && userId) {
          // قراءة Session من Firestore
          const userDoc = await firestore()
            .collection('users')
            .doc(userId)
            .get();
          
          const remoteSession = userDoc.data()?.currentSession?.sessionId;
          
          // 4. المقارنة
          if (localSession !== remoteSession) {
            // تسجيل خروج تلقائي
            console.log('❌ Session mismatch - logging out');
            console.log('Local:', localSession);
            console.log('Remote:', remoteSession);
            
            // ✅ إيقاف تتبع الموقع فوراً قبل الـ logout
            // (السائق دخل من جوال آخر، فلا داعي لاستمرار التتبع من هذا الجهاز)
            try {
              console.log('🛑 SESSION_MISMATCH: Stopping LocationService...');
              await LocationService.stop();
              console.log('✅ SESSION_MISMATCH: LocationService stopped');
            } catch (stopError) {
              console.error('❌ SESSION_MISMATCH: Failed to stop LocationService:', stopError);
              // نكمل عملية الـ logout حتى لو فشل الإيقاف
            }
            
            Alert.alert(
              'تنبيه',
              'تم تسجيل دخولك من جهاز آخر',
              [
                {
                  text: 'حسناً',
                  onPress: async () => {
                    await AsyncStorage.clear();
                    navigation.replace('Login');
                  }
                }
              ],
              { cancelable: false }
            );
          } else {
            // تحديث lastActive
            await firestore()
              .collection('users')
              .doc(userId)
              .update({
                'currentSession.lastActive': firestore.FieldValue.serverTimestamp(),
                'currentSession.appVersion': DeviceInfo.getVersion()
              });
          }
        }
      } catch (error) {
        console.error('❌ Session check error:', error);
      }
    };
    
    // فحص فوري عند التحميل
    if (userId) {
      checkSession();
    }
    
    // فحص كل دقيقة
    const interval = setInterval(() => {
      if (userId) {
        checkSession();
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [userId, navigation]);

  // تحديث رقم الإصدار تلقائياً كل 24 ساعة
  useEffect(() => {
    const updateAppVersion = async () => {
      try {
        if (!driverId) return;
        
        // قراءة آخر وقت تحديث
        const lastUpdate = await AsyncStorage.getItem('lastVersionUpdate');
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000; // 24 ساعة
        
        // إذا مر 24 ساعة أو لم يتم التحديث من قبل
        if (!lastUpdate || (now - parseInt(lastUpdate)) > oneDayMs) {
          console.log('🔄 Updating app version in Firestore...');
          
          const currentVersion = DeviceInfo.getVersion();
          
          // تحديث رقم الإصدار في drivers collection
          await firestore()
            .collection('drivers')
            .doc(driverId)
            .update({
              appVersion: currentVersion,
              lastVersionUpdate: Date.now()
            });
          
          // حفظ وقت التحديث
          await AsyncStorage.setItem('lastVersionUpdate', now.toString());
          
          console.log('✅ App version updated to:', currentVersion);
        } else {
          console.log('ℹ️ App version already updated today');
        }
      } catch (error) {
        console.error('❌ Error updating app version:', error);
      }
    };
    
    // تحديث فوري عند التحميل
    if (driverId) {
      updateAppVersion();
    }
    
    // فحص كل 24 ساعة
    const interval = setInterval(() => {
      if (driverId) {
        updateAppVersion();
      }
    }, 24 * 60 * 60 * 1000); // 24 ساعة
    
    return () => clearInterval(interval);
  }, [driverId]);

  // Reload WebView when app comes back from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      console.log('🔄 AppState changed to:', nextAppState);
      
      if (nextAppState === 'active' && webViewRef.current) {
        console.log('✅ App became active, reloading WebView...');
        // Reload WebView to ensure it displays correctly
        webViewRef.current.reload();
      }
    });

    return () => {
      subscription?.remove();
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
            // لا رسالة للسائق
          }
        } catch (error) {
          console.error('❌ MAIN: Init tracking error:', error);
          console.error('❌ MAIN: Error message:', error.message);
          console.error('❌ MAIN: Error stack:', error.stack);
          // لا رسالة للسائق
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
        try {
          const token = await AsyncStorage.getItem('fcmToken');
          if (token) {
            console.log('[FCM] Found saved token, registering with driverId:', driverId);
            const result = await registerFCMToken(driverId, token);
            if (result.success) {
              console.log('[FCM] Token registered successfully in Firestore');
            } else {
              console.error('[FCM] Failed to register token:', result.error, result.code);
            }
          } else {
            console.log('[FCM] No saved token yet, will register when setupFCM completes');
          }
        } catch (error) {
          console.error('[FCM] Error registering token on driverId load:', error);
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
      } else if (route.params?.driverId) {
        setDriverId(route.params.driverId);
        setUserId(route.params.driverId);
        console.log('🔵 MAIN: driverId from params:', route.params.driverId);
      } else {
        // No driver data, go back to login
        console.log('❌ MAIN: No driverId found, redirecting to Login');
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

  // Setup FCM for push notifications and wake-up
  const setupFCM = async () => {
    try {
      console.log('[FCM] Setting up FCM...');
      
      // Request permission (iOS only, Android auto-granted)
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      
      console.log('[FCM] Permission status:', authStatus, 'Enabled:', enabled);
      
      if (enabled) {
        console.log('[FCM] Permission granted');
        
        // Get FCM token
        console.log('[FCM] Getting FCM token...');
        const token = await messaging().getToken();
        console.log('[FCM] Token:', token);
        
        if (!token) {
          console.error('[FCM] Token is null or undefined!');
          return;
        }
        
        console.log('[FCM] Token obtained:', token.substring(0, 50) + '...', 'Length:', token.length);
        
        // Save token to AsyncStorage
        await AsyncStorage.setItem('fcmToken', token);
        console.log('[FCM] Token saved to AsyncStorage');
        
        // Register token with driver ID when available
        if (driverId) {
          console.log('[FCM] Registering token for driver:', driverId);
          const result = await registerFCMToken(driverId, token);
          if (result.success) {
            console.log('[FCM] Token registered successfully in Firestore');
          } else {
            console.error('[FCM] Failed to register token:', result.error, result.code);
          }
        } else {
          console.log('[FCM] driverId not available yet, will register later');
        }
      } else {
        console.log('[FCM] Permission denied');
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
    } catch (error) {
      console.error('[FCM] Setup error:', error);
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
        // لا رسالة للسائق
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
        // لا رسالة للسائق
        return false;
      }
    } catch (error) {
      console.error('❌ Error starting location tracking:', error);
      console.error('Error details:', JSON.stringify(error));
      
      // Show detailed error to user
      // لا رسالة للسائق
      
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
        
        // لا رسالة للسائق
        
        return true;
      } else {
        // لا رسالة للسائق
        return false;
      }
    } catch (error) {
      console.error('❌ Error stopping location tracking:', error);
      
      // لا رسالة للسائق
      
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
        
        // لا رسالة للسائق
        
        return true;
      } else {
        // لا رسالة للسائق
        return false;
      }
    } catch (error) {
      console.error('❌ Error getting current location:', error);
      
      // لا رسالة للسائق
      
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
      'هل أنت متأكد من إغلاق البرنامج؟',
      [{ text: 'إلغاء' }]
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
            <Text style={styles.headerTitle}>🚖 نظام إدارة السائقين</Text>
            {driverName ? (
              <Text style={styles.headerSubtitle}>مرحباً، {driverName}</Text>
            ) : null}
            <Text style={styles.versionText}>v{DeviceInfo.getVersion()}</Text>
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
        
        {/* Footer with version */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>الإصدار: {DeviceInfo.getVersion()}</Text>
        </View>
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
  footer: {
    backgroundColor: '#f9fafb',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});

export default MainScreen;

