import { Tabs } from 'expo-router';
import FloatingTabBar from '../../src/components/ui/FloatingTabBar';

export default function AdminLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
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
