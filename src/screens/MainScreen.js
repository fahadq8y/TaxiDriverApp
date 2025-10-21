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
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocationService from '../services/LocationService';

const { PowerManagerModule } = NativeModules;

const MainScreen = ({ navigation, route }) => {
  const [userId, setUserId] = useState(null);
  const [driverId, setDriverId] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [locationServiceStarted, setLocationServiceStarted] = useState(false);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const webViewRef = useRef(null);

  useEffect(() => {
    loadDriverData();

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
    if (driverId && !locationServiceStarted) {
      startLocationTracking(driverId);
    }
  }, [userId]);

  const loadDriverData = async () => {
    try {
      console.log('🔵 MAIN: Loading driver data from AsyncStorage...');
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedDriverName = await AsyncStorage.getItem('userName');
      const storedDriverId = await AsyncStorage.getItem('driverId');
      
      console.log('🔵 MAIN: storedUserId:', storedUserId);
      console.log('🔵 MAIN: storedDriverName:', storedDriverName);
      console.log('🔵 MAIN: storedDriverId:', storedDriverId);
      
      if (storedUserId) {
        console.log('✅ MAIN: Setting state with stored data');
        setUserId(storedUserId);
        const finalDriverId = storedDriverId || storedUserId;
        console.log('🔵 MAIN: finalDriverId to set:', finalDriverId);
        setDriverId(finalDriverId);
        setDriverName(storedDriverName || '');
      } else if (route.params?.driverId) {
        setDriverId(route.params.driverId);
        setUserId(route.params.driverId);
      } else {
        // No driver data, go back to login
        navigation.replace('Login');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading driver data:', error);
      setLoading(false);
    }
  };

  const checkAndRequestBatteryOptimization = async () => {
    if (Platform.OS === 'android') {
      try {
        // فتح إعدادات Battery Optimization مباشرة
        Alert.alert(
          'تفعيل التتبع المستمر',
          'للتتبع المستمر حتى عند قفل الشاشة، يجب تعطيل تحسين البطارية للتطبيق\n\nخطوات:\n1. اضغط "فتح الإعدادات"\n2. ابحث عن "البطارية" أو "Battery"\n3. اختر "تحسين البطارية" أو "Battery Optimization"\n4. ابحث عن التطبيق واختر "عدم التحسين" أو "Don\'t optimize"',
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
        Alert.alert('خطأ', 'لم يتم العثور على معرف السائق. الرجاء تسجيل الدخول مرة أخرى.');
        return;
      }
      
      console.log('🚀 Attempting to start location tracking...');
      
      await LocationService.start(currentDriverId);
      setLocationServiceStarted(true);
      console.log('✅ Location tracking started successfully');
      
      Alert.alert(
        'نجح التفعيل',
        'تم تفعيل خدمة التتبع بنجاح! يجب أن تشاهد إشعار في شريط الإشعارات.',
        [{ text: 'حسناً' }]
      );
      
      // التحقق من Battery Optimization بعد 3 ثواني
      setTimeout(() => {
        checkAndRequestBatteryOptimization();
      }, 3000);
    } catch (error) {
      console.error('❌ Error starting location tracking:', error);
      console.error('Error details:', JSON.stringify(error));
      
      // معالجة خاصة لخطأ صلاحية الإشعارات
      if (error.message === 'NOTIFICATION_PERMISSION_DENIED') {
        Alert.alert(
          'صلاحية الإشعارات مطلوبة',
          'لتفعيل خدمة التتبع، يجب السماح بالإشعارات.\n\nالإشعار ضروري لعمل التتبع في الخلفية.\n\nالرجاء:\n1. فتح إعدادات التطبيق\n2. تفعيل "السماح بالإشعارات"\n3. العودة للتطبيق',
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
      } else {
        // رسالة خطأ عامة
        Alert.alert(
          'فشل التفعيل',
          `لم يتم تفعيل خدمة التتبع.\n\n${error.message || 'خطأ غير معروف'}\n\nالرجاء:\n1. السماح بصلاحيات الموقع\n2. تفعيل الإشعارات\n3. تفعيل GPS\n4. إعادة تشغيل التطبيق`,
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
      }
    }
  };

  const handleBackPress = () => {
    if (webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
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
              // إيقاف خدمة التتبع
              await LocationService.stop();
              // مسح البيانات المحفوظة
              await AsyncStorage.clear();
              // العودة لشاشة تسجيل الدخول
              navigation.replace('Login');
            } catch (error) {
              console.error('Error during logout:', error);
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
          sessionStorage.setItem('driverId', '${userId}');
          
          console.log('Driver data injected successfully - driverId: ${userId}');
          
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFC107" />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  const webViewUrl = `https://taxi-management-system-d8210.web.app/driver-view.html?driverId=${userId}`;

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
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
            Alert.alert(
              'خطأ في التحميل',
              'حدث خطأ أثناء تحميل الصفحة. الرجاء التحقق من الاتصال بالإنترنت'
            );
          }}
          onLoadStart={() => console.log('WebView loading started')}
          onLoadEnd={() => console.log('WebView loading ended')}
          onMessage={(event) => {
            console.log('WebView message:', event.nativeEvent.data);
          }}
        />

        {/* Location Service Indicator */}
        {locationServiceStarted && (
          <View style={styles.locationIndicator}>
            <View style={styles.locationDot} />
            <Text style={styles.locationText}>التتبع نشط</Text>
          </View>
        )}
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
  locationIndicator: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#10b981',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
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
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginLeft: 8,
  },
  locationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default MainScreen;

