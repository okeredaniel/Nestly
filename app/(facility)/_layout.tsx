import { Redirect, Tabs } from 'expo-router';
import FloatingTabBar from '../../src/components/ui/FloatingTabBar';
import { useAuth } from '@/context/AuthContext';
import { HOME_ROUTE } from '@/lib/roles';

export default function FacilityLayout() {
  const { profile, loading } = useAuth();

  if (!loading && profile?.role && profile.role !== 'facility') {
    return <Redirect href={HOME_ROUTE[profile.role] as any} />;
  }

  return (
    <Tabs
      tabBar={(props: any) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="issues" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="notices" />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
