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
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocationService from '../services/LocationService';

const MainScreen = ({ navigation, route }) => {
  const [driverId, setDriverId] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [locationServiceStarted, setLocationServiceStarted] = useState(false);
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
      startLocationTracking();
    }
  }, [driverId]);

  const loadDriverData = async () => {
    try {
      const storedDriverId = await AsyncStorage.getItem('driverId');
      const storedDriverName = await AsyncStorage.getItem('driverName');
      
      if (storedDriverId) {
        setDriverId(storedDriverId);
        setDriverName(storedDriverName || '');
      } else if (route.params?.driverId) {
        setDriverId(route.params.driverId);
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

  const startLocationTracking = async () => {
    try {
      await LocationService.start();
      setLocationServiceStarted(true);
      console.log('Location tracking started');
    } catch (error) {
      console.error('Error starting location tracking:', error);
      Alert.alert(
        'تنبيه',
        'لم يتم تفعيل خدمة التتبع. الرجاء السماح بصلاحيات الموقع'
      );
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  const webViewUrl = `https://test-taxi-knpc.vercel.app/driver-view.html?driverId=${driverId}`;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#2563eb" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>🚖 تطبيق السائق</Text>
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
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
            </View>
          )}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={false}
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
    backgroundColor: '#2563eb',
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
    color: '#e0e7ff',
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

