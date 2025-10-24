import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestTrackingScreen = ({ navigation }) => {
  const [driverData, setDriverData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [testDriverId, setTestDriverId] = useState(null);

  useEffect(() => {
    // Load driver ID from AsyncStorage
    const loadDriverId = async () => {
      try {
        const storedEmployeeNumber = await AsyncStorage.getItem('employeeNumber');
        console.log('[TestTracking] Loaded employeeNumber:', storedEmployeeNumber);
        
        if (storedEmployeeNumber) {
          setTestDriverId(storedEmployeeNumber);
        } else {
          setError('لم يتم العثور على الرقم الوظيفي. الرجاء تسجيل الدخول مرة أخرى.');
          setLoading(false);
        }
      } catch (err) {
        console.error('[TestTracking] Error loading driver ID:', err);
        setError('خطأ في تحميل معرف السائق');
        setLoading(false);
      }
    };
    
    loadDriverId();
  }, []);

  useEffect(() => {
    if (!testDriverId) {
      console.log('[TestTracking] No driver ID yet, waiting...');
      return;
    }
    
    console.log('[TestTracking] Setting up real-time listener for driver:', testDriverId);
    
    // Subscribe to real-time updates
    const unsubscribe = firestore()
      .collection('drivers')
      .doc(testDriverId)
      .onSnapshot(
        (documentSnapshot) => {
          console.log('[TestTracking] Document snapshot received');
          
          if (documentSnapshot.exists) {
            const data = documentSnapshot.data();
            console.log('[TestTracking] Driver data:', JSON.stringify(data, null, 2));
            setDriverData(data);
            setLastUpdate(new Date().toLocaleTimeString('ar-SA'));
            setError(null);
          } else {
            console.log('[TestTracking] Document does not exist');
            setError('لم يتم العثور على بيانات السائق');
            setDriverData(null);
          }
          
          setLoading(false);
        },
        (err) => {
          console.error('[TestTracking] Error:', err);
          setError('خطأ في الاتصال: ' + err.message);
          setLoading(false);
        }
      );

    // Cleanup subscription
    return () => unsubscribe();
  }, [testDriverId]);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      console.log('[TestTracking] Manual refresh...');
      
      const doc = await firestore()
        .collection('drivers')
        .doc(testDriverId)
        .get();
      
      if (doc.exists) {
        const data = doc.data();
        console.log('[TestTracking] Refreshed data:', JSON.stringify(data, null, 2));
        setDriverData(data);
        setLastUpdate(new Date().toLocaleTimeString('ar-SA'));
        setError(null);
        Alert.alert('تم', 'تم تحديث البيانات');
      } else {
        setError('لم يتم العثور على بيانات السائق');
        setDriverData(null);
        Alert.alert('تنبيه', 'لم يتم العثور على بيانات السائق في Firebase');
      }
    } catch (err) {
      console.error('[TestTracking] Refresh error:', err);
      setError('خطأ في التحديث: ' + err.message);
      Alert.alert('خطأ', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInMaps = () => {
    if (driverData?.location) {
      const { latitude, longitude } = driverData.location;
      Alert.alert(
        'فتح في الخرائط',
        `Latitude: ${latitude}\nLongitude: ${longitude}\n\nيمكنك نسخ هذه الإحداثيات ولصقها في Google Maps`
      );
    } else {
      Alert.alert('تنبيه', 'لا يوجد موقع متاح');
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'غير متوفر';
    
    try {
      // Check if it's a Firestore Timestamp
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString('ar-SA');
      }
      // Check if it's a Date object
      if (timestamp instanceof Date) {
        return timestamp.toLocaleString('ar-SA');
      }
      // Check if it's a timestamp number
      if (typeof timestamp === 'number') {
        return new Date(timestamp).toLocaleString('ar-SA');
      }
      return 'غير متوفر';
    } catch (err) {
      console.error('[TestTracking] Error formatting timestamp:', err);
      return 'خطأ في التنسيق';
    }
  };

  if (loading && !driverData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ صفحة التتبع التجريبية</Text>
        <Text style={styles.subtitle}>مراقبة موقع السائق من Firebase</Text>
      </View>

      {/* حالة الاتصال */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📡 حالة الاتصال</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>الحالة:</Text>
          <View style={[styles.badge, error ? styles.badgeError : styles.badgeSuccess]}>
            <Text style={styles.badgeText}>
              {error ? '✗ خطأ' : '✓ متصل'}
            </Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>آخر تحديث:</Text>
          <Text style={styles.statusValue}>{lastUpdate || 'لم يتم التحديث'}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>التحديث التلقائي:</Text>
          <View style={[styles.badge, autoRefresh ? styles.badgeSuccess : styles.badgeWarning]}>
            <Text style={styles.badgeText}>
              {autoRefresh ? '✓ مفعّل' : '○ معطّل'}
            </Text>
          </View>
        </View>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {/* معلومات السائق */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 معلومات السائق</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>معرف السائق:</Text>
          <Text style={styles.infoValue}>{testDriverId}</Text>
        </View>
        {driverData && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>حالة النشاط:</Text>
              <View style={[styles.badge, driverData.isActive ? styles.badgeSuccess : styles.badgeError]}>
                <Text style={styles.badgeText}>
                  {driverData.isActive ? '✓ نشط' : '✗ غير نشط'}
                </Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>آخر تحديث:</Text>
              <Text style={styles.infoValue}>
                {formatTimestamp(driverData.lastUpdate)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* بيانات الموقع */}
      {driverData?.location ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 بيانات الموقع</Text>
          <View style={styles.locationBox}>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Latitude:</Text>
              <Text style={styles.locationValue}>
                {driverData.location.latitude.toFixed(6)}
              </Text>
            </View>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Longitude:</Text>
              <Text style={styles.locationValue}>
                {driverData.location.longitude.toFixed(6)}
              </Text>
            </View>
            <View style={styles.locationRow}>
              <Text style={styles.locationLabel}>Accuracy:</Text>
              <Text style={styles.locationValue}>
                {driverData.location.accuracy.toFixed(2)} m
              </Text>
            </View>
            {driverData.location.speed !== undefined && (
              <View style={styles.locationRow}>
                <Text style={styles.locationLabel}>Speed:</Text>
                <Text style={styles.locationValue}>
                  {(driverData.location.speed * 3.6).toFixed(1)} km/h
                </Text>
              </View>
            )}
            {driverData.location.heading !== undefined && (
              <View style={styles.locationRow}>
                <Text style={styles.locationLabel}>Heading:</Text>
                <Text style={styles.locationValue}>
                  {driverData.location.heading.toFixed(0)}°
                </Text>
              </View>
            )}
          </View>
          
          <TouchableOpacity
            style={[styles.button, styles.buttonInfo]}
            onPress={handleOpenInMaps}
          >
            <Text style={styles.buttonText}>🗺️ عرض الإحداثيات</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 بيانات الموقع</Text>
          <View style={styles.noDataBox}>
            <Text style={styles.noDataText}>⚠️ لا يوجد موقع متاح</Text>
            <Text style={styles.noDataSubtext}>
              تأكد من بدء التتبع في صفحة السائق
            </Text>
          </View>
        </View>
      )}

      {/* البيانات الخام */}
      {driverData && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔍 البيانات الخام (JSON)</Text>
          <ScrollView horizontal>
            <Text style={styles.jsonText}>
              {JSON.stringify(driverData, null, 2)}
            </Text>
          </ScrollView>
        </View>
      )}

      {/* أزرار التحكم */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={handleRefresh}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? '⏳ جاري التحديث...' : '🔄 تحديث يدوي'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>← رجوع لصفحة السائق</Text>
        </TouchableOpacity>
      </View>

      {/* تعليمات */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>📋 تعليمات:</Text>
        <Text style={styles.instructionsText}>
          • هذه الصفحة تستمع للتحديثات من Firebase في الوقت الفعلي
        </Text>
        <Text style={styles.instructionsText}>
          • عند تحديث الموقع في صفحة السائق، سيظهر هنا تلقائياً
        </Text>
        <Text style={styles.instructionsText}>
          • إذا لم يظهر موقع، تأكد من بدء التتبع في صفحة السائق
        </Text>
        <Text style={styles.instructionsText}>
          • يمكنك فتح Firebase Console للتحقق من البيانات مباشرة
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#9C27B0',
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
    fontSize: 14,
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
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 10,
  },
  locationBox: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locationLabel: {
    fontSize: 15,
    color: '#1565c0',
    fontWeight: '600',
  },
  locationValue: {
    fontSize: 15,
    color: '#0d47a1',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  noDataBox: {
    backgroundColor: '#fff3cd',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 18,
    color: '#856404',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  jsonText: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 5,
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
  buttonPrimary: {
    backgroundColor: '#2196F3',
  },
  buttonSecondary: {
    backgroundColor: '#607D8B',
  },
  buttonInfo: {
    backgroundColor: '#00BCD4',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructions: {
    backgroundColor: '#e8f5e9',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2e7d32',
  },
  instructionsText: {
    fontSize: 14,
    color: '#2e7d32',
    marginBottom: 5,
    lineHeight: 20,
  },
});

export default TestTrackingScreen;

