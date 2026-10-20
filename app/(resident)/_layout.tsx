import { Redirect, Tabs } from 'expo-router';
import FloatingTabBar from '../../src/components/ui/FloatingTabBar';
import { useAuth } from '@/context/AuthContext';
import { HOME_ROUTE } from '@/lib/roles';

export default function ResidentLayout() {
  const { profile, loading } = useAuth();

  if (!loading && profile?.role && profile.role !== 'resident') {
    return <Redirect href={HOME_ROUTE[profile.role] as any} />;
  }

  return (
    <Tabs
      tabBar={(props: any) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="resident-home" options={{ title: 'Home' }} />
      <Tabs.Screen name="report" options={{ title: 'Report' }} />
      <Tabs.Screen name="book" options={{ title: 'Book' }} />
      <Tabs.Screen name="alert" options={{ title: 'Alert', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
