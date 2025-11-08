import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import packageJson from '../../package.json';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // دالة مساعدة لمتابعة تسجيل الدخول
  const continueLogin = async (userId, userName, employeeNumber) => {
    try {
      await AsyncStorage.setItem('userId', userId);
      await AsyncStorage.setItem('userName', userName);
      await AsyncStorage.setItem('employeeNumber', employeeNumber);
      await AsyncStorage.setItem('userRole', 'driver');
      await AsyncStorage.setItem('persistentLogin', 'true');
      
      const savedEmployeeNumber = await AsyncStorage.getItem('employeeNumber');
      console.log('✅ LOGIN: employeeNumber saved successfully:', savedEmployeeNumber);

      setLoading(false);
      navigation.replace('Main');
    } catch (storageError) {
      console.error('❌ LOGIN: AsyncStorage error:', storageError);
      Alert.alert('خطأ', 'فشل حفظ بيانات تسجيل الدخول: ' + storageError.message);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);

    try {
      // البحث في مجموعة users عن السائق باستخدام name
      const usersRef = firestore().collection('users');
      const snapshot = await usersRef
        .where('name', '==', username)
        .where('role', '==', 'driver')
        .get();

      if (snapshot.empty) {
        Alert.alert('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة');
        setLoading(false);
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();

      // التحقق من كلمة المرور
      if (userData.password !== password) {
        Alert.alert('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة');
        setLoading(false);
        return;
      }

      // التحقق من أن الحساب نشط
      if (userData.isActive !== true) {
        Alert.alert('خطأ', 'هذا الحساب غير نشط');
        setLoading(false);
        return;
      }

      // حفظ بيانات المستخدم
      console.log('🔵 LOGIN: User data from Firestore:', JSON.stringify(userData));
      console.log('🔵 LOGIN: driverId from userData:', userData.driverId);
      console.log('🔵 LOGIN: userDoc.id:', userDoc.id);
      
      // التأكد من وجود القيم المطلوبة
      const userId = userDoc.id || '';
      const userName = userData.name || '';
      const employeeNumber = userData.driverId || userData.employeeNumber || '';
      
      console.log('🔵 LOGIN: Values to save:', {
        userId,
        userName,
        employeeNumber
      });
      
      // التحقق من أن القيم ليست فارغة
      if (!userId || !employeeNumber) {
        console.error('❌ LOGIN: Missing required values!');
        Alert.alert('خطأ', 'بيانات المستخدم غير مكتملة. الرجاء التواصل مع الإدارة.');
        setLoading(false);
        return;
      }
      
      // حماية من تغيير السائق
      const activeDriverId = await AsyncStorage.getItem('employeeNumber');
      
      if (activeDriverId && activeDriverId !== employeeNumber) {
        console.log('⚠️ LOGIN: Different driver detected:', activeDriverId, 'vs', employeeNumber);
        
        // عرض رسالة تنبيه
        Alert.alert(
          'تنبيه',
          'يوجد سائق آخر مسجل دخوله على هذا الجهاز.\n\nهل تريد تسجيل الدخول بحسابك؟',
          [
            {
              text: 'إلغاء',
              style: 'cancel',
              onPress: () => {
                setLoading(false);
              }
            },
            {
              text: 'نعم',
              onPress: async () => {
                try {
                  // إيقاف الخدمات القديمة
                  console.log('⚠️ LOGIN: Stopping old services...');
                  const LocationService = require('../services/LocationService').default;
                  await LocationService.stop();
                  console.log('✅ LOGIN: Old services stopped');
                  
                  // متابعة تسجيل الدخول
                  await continueLogin(userId, userName, employeeNumber);
                } catch (stopError) {
                  console.error('❌ LOGIN: Error stopping old services:', stopError);
                  // متابعة تسجيل الدخول حتى لو فشل الإيقاف
                  await continueLogin(userId, userName, employeeNumber);
                }
              }
            }
          ]
        );
        return;
      }
      
      // متابعة تسجيل الدخول للسائق نفسه أو الأول
      await continueLogin(userId, userName, employeeNumber);
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تسجيل الدخول');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        
        {/* Header with gradient background */}
        <View style={styles.header}>
          <Image
            source={require('../assets/taxi_illustration.png')}
            style={styles.taxiImage}
            resizeMode="contain"
          />
          <Text style={styles.title}>إدارة حساب السائق</Text>
          <Text style={styles.subtitle}>مرحباً بك</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>اسم المستخدم</Text>
            <TextInput
              style={styles.input}
              placeholder="أدخل اسم المستخدم"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              textAlign="right"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>كلمة المرور</Text>
            <TextInput
              style={styles.input}
              placeholder="أدخل كلمة المرور"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textAlign="right"
              placeholderTextColor="#999"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>تسجيل الدخول</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>جميع الحقوق محفوظة © 2025</Text>
        <Text style={styles.versionText}>الإصدار: {packageJson.version}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#FFC107',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  taxiImage: {
    width: 200,
    height: 150,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 40,
    paddingBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  button: {
    backgroundColor: '#FFC107',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    paddingBottom: 5,
  },
  versionText: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 10,
    paddingBottom: 20,
    fontFamily: 'monospace',
  },
});

export default LoginScreen;

