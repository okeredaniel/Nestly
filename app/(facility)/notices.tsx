import { Animated, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NoticesBoard from '@/components/ui/NoticesBoard';
import { useScreenIntro } from '@/hooks/useScreenIntro';

export default function FacilityNotices() {
  const insets = useSafeAreaInsets();
  const { style: introStyle } = useScreenIntro();

  return (
    <Animated.View style={[{ flex: 1 }, introStyle]}>
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
    </Animated.View>
  );
}