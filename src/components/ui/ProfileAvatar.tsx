import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import Avatar from '@/components/ui/Avatar';

type Props = {
  online?: boolean;
  fallback?: string; // used for the letter if the profile has no name yet
  onPress?: () => void;
};

export default function ProfileAvatar({ online = false, fallback = 'Member', onPress }: Props) {
  const { profile } = useAuth();

  const body = (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#B79BFF', '#5B3CF0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ring}
      >
        <View style={styles.inner}>
          <Avatar
            uri={profile?.photoURL}
            name={profile?.name?.trim() || fallback}
            size={42}
          />
        </View>
      </LinearGradient>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  wrap: { width: 54, height: 54 },
  ring: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  inner: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  dot: {
    position: 'absolute', right: 0, top: 5, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22C55E', borderWidth: 2.5, borderColor: '#FFFFFF',
  },
});
