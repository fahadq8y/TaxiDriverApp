import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';

const Stack = createNativeStackNavigator();

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Login');

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const persistentLogin = await AsyncStorage.getItem('persistentLogin');
      const employeeNumber = await AsyncStorage.getItem('employeeNumber');
      
      if (persistentLogin === 'true' && employeeNumber) {
        console.log('✅ AUTO-LOGIN: User is logged in, navigating to Main');
        setInitialRoute('Main');
      } else {
        console.log('ℹ️ AUTO-LOGIN: No persistent login found');
        setInitialRoute('Login');
      }
    } catch (error) {
      console.error('❌ AUTO-LOGIN: Error checking login status:', error);
      setInitialRoute('Login');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#FFC107" />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
          }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Main" component={MainScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default App;

