import { Tabs } from 'expo-router';
import FloatingTabBar from '../../src/components/ui/FloatingTabBar';

export default function FacilityLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="issues" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="notices" />
      <Tabs.Screen name="vendors" />
    </Tabs>
  );
}
