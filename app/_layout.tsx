import { useEffect } from 'react';
import { Stack }      from 'expo-router';
import { StatusBar }  from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Toast          from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../lib/store';
import { initDb }    from '../lib/db/offline';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { loadFromStorage, isLoading } = useAuthStore();

  useEffect(() => {
    initDb();
    loadFromStorage().finally(() => SplashScreen.hideAsync());
  }, []);

  if (isLoading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" />
      </Stack>
      <StatusBar style="light" />
      <Toast />
    </GestureHandlerRootView>
  );
}
