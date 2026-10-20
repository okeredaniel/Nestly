import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { HOME_ROUTE } from '@/lib/roles';

export default function SecurityLayout() {
  const { profile, loading } = useAuth();

  if (!loading && profile?.role && profile.role !== 'security') {
    return <Redirect href={HOME_ROUTE[profile.role] as any} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
