import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';
import TestDriverScreen from './src/screens/TestDriverScreen';
import TestTrackingScreen from './src/screens/TestTrackingScreen';

const Stack = createNativeStackNavigator();

function App() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
          }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Main" component={MainScreen} />
          <Stack.Screen 
            name="TestDriver" 
            component={TestDriverScreen}
            options={{ title: 'اختبار السائق' }}
          />
          <Stack.Screen 
            name="TestTracking" 
            component={TestTrackingScreen}
            options={{ title: 'اختبار التتبع' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default App;

