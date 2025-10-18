import React, { useState, useEffect } from 'react';
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
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = async () => {
    try {
      const driverId = await AsyncStorage.getItem('driverId');
      if (driverId) {
        // المستخدم مسجل دخول مسبقاً
        navigation.replace('Main', { driverId });
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);

    try {
      // البحث عن السائق في Firestore (username بأحرف صغيرة)
      const driversSnapshot = await firestore()
        .collection('drivers')
        .where('username', '==', username.trim().toLowerCase())
        .get();

      if (driversSnapshot.empty) {
        Alert.alert('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة');
        setLoading(false);
        return;
      }

      const driverDoc = driversSnapshot.docs[0];
      const driverData = driverDoc.data();

      // التحقق من أن الحساب ليس محذوفاً
      if (driverData.deleted) {
        Alert.alert('خطأ', 'هذا الحساب غير نشط. الرجاء التواصل مع الإدارة');
        setLoading(false);
        return;
      }

      // التحقق من كلمة المرور (حساسة لحالة الأحرف)
      if (driverData.password !== password) {
        Alert.alert('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة');
        setLoading(false);
        return;
      }

      // حفظ بيانات السائق
      await AsyncStorage.setItem('driverId', driverDoc.id);
      await AsyncStorage.setItem('driverData', JSON.stringify(driverData));
      await AsyncStorage.setItem('driverName', driverData.name || '');

      setLoading(false);

      // الانتقال إلى الشاشة الرئيسية
      navigation.replace('Main', { driverId: driverDoc.id });
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تسجيل الدخول. الرجاء المحاولة مرة أخرى');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>جاري التحقق...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f4f6" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.logo}>🚖</Text>
            <Text style={styles.title}>نظام تتبع السائقين</Text>
            <Text style={styles.subtitle}>تسجيل الدخول</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>اسم المستخدم</Text>
              <TextInput
                style={styles.input}
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                textAlign="right"
                editable={!loading}
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
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>دخول</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              في حال نسيان كلمة المرور، الرجاء التواصل مع الإدارة
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 60,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
  },
  form: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
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

export default LoginScreen;

