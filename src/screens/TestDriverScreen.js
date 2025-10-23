import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import LocationService from '../services/LocationService';

const TestDriverScreen = ({ navigation }) => {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState(null);
  const [serviceState, setServiceState] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);

  const testDriverId = 'DRV001'; // معرف تجريبي

  useEffect(() => {
    checkPermissions();
    updateServiceState();
  }, []);

  const checkPermissions = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        setHasPermission(granted);
        console.log('[TestDriver] Permission status:', granted);
      } else {
        setHasPermission(true);
      }
    } catch (error) {
      console.error('[TestDriver] Error checking permissions:', error);
    }
  };

  const requestPermissions = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'صلاحية الموقع',
            message: 'التطبيق يحتاج صلاحية الوصول للموقع',
            buttonPositive: 'موافق',
            buttonNegative: 'إلغاء',
          }
        );
        
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        setHasPermission(isGranted);
        
        if (isGranted) {
          Alert.alert('نجح', 'تم منح صلاحية الموقع');
        } else {
          Alert.alert('تنبيه', 'يجب منح صلاحية الموقع لتفعيل التتبع');
        }
      }
    } catch (error) {
      console.error('[TestDriver] Error requesting permissions:', error);
      Alert.alert('خطأ', 'فشل طلب الصلاحية: ' + error.message);
    }
  };

  const updateServiceState = () => {
    const state = LocationService.getState();
    setServiceState(state);
    setIsTracking(state.isTracking);
  };

  const handleStartTracking = async () => {
    try {
      console.log('[TestDriver] Starting tracking...');
      
      if (!hasPermission) {
        Alert.alert(
          'صلاحية مطلوبة',
          'يجب منح صلاحية الموقع أولاً',
          [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'طلب الصلاحية', onPress: requestPermissions }
          ]
        );
        return;
      }

      const started = await LocationService.start(testDriverId);
      
      if (started) {
        setIsTracking(true);
        updateServiceState();
        Alert.alert('نجح', 'تم بدء التتبع بنجاح!\n\nتحقق من:\n1. إشعار التتبع في الأعلى\n2. Firebase Console');
      } else {
        Alert.alert('فشل', 'فشل بدء التتبع. تحقق من Console logs');
      }
    } catch (error) {
      console.error('[TestDriver] Error starting tracking:', error);
      Alert.alert('خطأ', 'حدث خطأ: ' + error.message);
    }
  };

  const handleStopTracking = async () => {
    try {
      console.log('[TestDriver] Stopping tracking...');
      
      const stopped = await LocationService.stop();
      
      if (stopped) {
        setIsTracking(false);
        updateServiceState();
        Alert.alert('نجح', 'تم إيقاف التتبع');
      } else {
        Alert.alert('فشل', 'فشل إيقاف التتبع');
      }
    } catch (error) {
      console.error('[TestDriver] Error stopping tracking:', error);
      Alert.alert('خطأ', 'حدث خطأ: ' + error.message);
    }
  };

  const handleGetCurrentLocation = async () => {
    try {
      console.log('[TestDriver] Getting current location...');
      
      const location = await LocationService.getCurrentPosition();
      
      if (location) {
        setLastLocation(location.coords);
        Alert.alert(
          'الموقع الحالي',
          `Latitude: ${location.coords.latitude.toFixed(6)}\nLongitude: ${location.coords.longitude.toFixed(6)}\nAccuracy: ${location.coords.accuracy.toFixed(2)}m`
        );
      } else {
        Alert.alert('فشل', 'فشل الحصول على الموقع');
      }
    } catch (error) {
      console.error('[TestDriver] Error getting location:', error);
      Alert.alert('خطأ', 'حدث خطأ: ' + error.message);
    }
  };

  const handleRefreshState = () => {
    updateServiceState();
    checkPermissions();
    Alert.alert('تم', 'تم تحديث الحالة');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚗 صفحة السائق التجريبية</Text>
        <Text style={styles.subtitle}>اختبار مكتبة Transistor</Text>
      </View>

      {/* حالة الصلاحيات */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📍 صلاحية الموقع</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>الحالة:</Text>
          <View style={[styles.badge, hasPermission ? styles.badgeSuccess : styles.badgeError]}>
            <Text style={styles.badgeText}>
              {hasPermission ? '✓ ممنوحة' : '✗ غير ممنوحة'}
            </Text>
          </View>
        </View>
        {!hasPermission && (
          <TouchableOpacity style={styles.buttonSecondary} onPress={requestPermissions}>
            <Text style={styles.buttonText}>طلب الصلاحية</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* حالة التتبع */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎯 حالة التتبع</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>التتبع:</Text>
          <View style={[styles.badge, isTracking ? styles.badgeSuccess : styles.badgeWarning]}>
            <Text style={styles.badgeText}>
              {isTracking ? '✓ نشط' : '○ غير نشط'}
            </Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>معرف السائق:</Text>
          <Text style={styles.statusValue}>{testDriverId}</Text>
        </View>
        {serviceState && (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>مُهيأ:</Text>
              <Text style={styles.statusValue}>
                {serviceState.isConfigured ? 'نعم' : 'لا'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>معرف حالي:</Text>
              <Text style={styles.statusValue}>
                {serviceState.currentDriverId || 'لا يوجد'}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* آخر موقع */}
      {lastLocation && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📌 آخر موقع</Text>
          <View style={styles.locationInfo}>
            <Text style={styles.locationText}>
              Latitude: {lastLocation.latitude.toFixed(6)}
            </Text>
            <Text style={styles.locationText}>
              Longitude: {lastLocation.longitude.toFixed(6)}
            </Text>
            <Text style={styles.locationText}>
              Accuracy: {lastLocation.accuracy.toFixed(2)}m
            </Text>
            {lastLocation.speed !== undefined && (
              <Text style={styles.locationText}>
                Speed: {(lastLocation.speed * 3.6).toFixed(1)} km/h
              </Text>
            )}
          </View>
        </View>
      )}

      {/* أزرار التحكم */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.buttonStart, !hasPermission && styles.buttonDisabled]}
          onPress={handleStartTracking}
          disabled={!hasPermission || isTracking}
        >
          <Text style={styles.buttonText}>
            {isTracking ? '✓ التتبع نشط' : '▶ بدء التتبع'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonStop, !isTracking && styles.buttonDisabled]}
          onPress={handleStopTracking}
          disabled={!isTracking}
        >
          <Text style={styles.buttonText}>■ إيقاف التتبع</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonInfo]}
          onPress={handleGetCurrentLocation}
        >
          <Text style={styles.buttonText}>📍 الموقع الحالي</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={handleRefreshState}
        >
          <Text style={styles.buttonText}>🔄 تحديث الحالة</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => navigation.navigate('TestTracking')}
        >
          <Text style={styles.buttonText}>🗺️ فتح صفحة التتبع</Text>
        </TouchableOpacity>
      </View>

      {/* تعليمات */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>📋 تعليمات الاختبار:</Text>
        <Text style={styles.instructionsText}>
          1. تأكد من منح صلاحية الموقع "Allow all the time"
        </Text>
        <Text style={styles.instructionsText}>
          2. اضغط "بدء التتبع"
        </Text>
        <Text style={styles.instructionsText}>
          3. تحقق من ظهور إشعار التتبع في الأعلى
        </Text>
        <Text style={styles.instructionsText}>
          4. افتح Firebase Console → drivers → DRV001
        </Text>
        <Text style={styles.instructionsText}>
          5. تحقق من وجود حقل location
        </Text>
        <Text style={styles.instructionsText}>
          6. افتح صفحة التتبع لرؤية الموقع على الخريطة
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2196F3',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  card: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 16,
    color: '#666',
  },
  statusValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  badgeSuccess: {
    backgroundColor: '#4CAF50',
  },
  badgeError: {
    backgroundColor: '#f44336',
  },
  badgeWarning: {
    backgroundColor: '#FF9800',
  },
  badgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  locationInfo: {
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 5,
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  controls: {
    padding: 15,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonStart: {
    backgroundColor: '#4CAF50',
  },
  buttonStop: {
    backgroundColor: '#f44336',
  },
  buttonInfo: {
    backgroundColor: '#2196F3',
  },
  buttonPrimary: {
    backgroundColor: '#9C27B0',
  },
  buttonSecondary: {
    backgroundColor: '#607D8B',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructions: {
    backgroundColor: '#fff3cd',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#856404',
  },
  instructionsText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 5,
    lineHeight: 20,
  },
});

export default TestDriverScreen;

