import { ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NoticesBoard from '@/components/ui/NoticesBoard';

export default function AdminNotices() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={['#DCD0FF', '#EFE9FF', '#FAF8FF']} style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 11,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 17,
        }}
      >
        <NoticesBoard />
      </ScrollView>
    </LinearGradient>
  );
}