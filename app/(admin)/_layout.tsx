import { Redirect, Tabs } from 'expo-router';
import FloatingTabBar from '../../src/components/ui/FloatingTabBar';
import { useAuth } from '@/context/AuthContext';
import { HOME_ROUTE } from '@/lib/roles';

export default function AdminLayout() {
  const { profile, loading } = useAuth();

  if (!loading && profile?.role && profile.role !== 'admin') {
    return <Redirect href={HOME_ROUTE[profile.role] as any} />;
  }

  return (
    <Tabs
      tabBar={(props: any) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="members" />
      <Tabs.Screen name="visitors" />
      <Tabs.Screen name="notices" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
