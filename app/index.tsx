import { Redirect } from 'expo-router';
import { useAuthStore } from '../lib/store';

export default function Index() {
  const { user } = useAuthStore();
  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/auth/login" />;
}
