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

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
      await AsyncStorage.setItem('userId', userDoc.id);
      await AsyncStorage.setItem('userName', userData.name);
      await AsyncStorage.setItem('userRole', 'driver');
      await AsyncStorage.setItem('driverId', userDoc.id);

      setLoading(false);
      navigation.replace('Main');
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
          <Text style={styles.title}>نظام تتبع السائقين</Text>
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
    paddingBottom: 20,
  },
});

export default LoginScreen;

