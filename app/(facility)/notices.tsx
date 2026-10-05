import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NoticesBoard from '@/components/ui/NoticesBoard';

export default function FacilityNotices() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: 50,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 40,
      }}
    >
      <NoticesBoard />
    </ScrollView>
  );
}