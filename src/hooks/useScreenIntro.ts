import { Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';

let introPlayed = false;

const rise = (value: Animated.Value, distance = 24, scaleFrom = 0.98) => ({
  opacity: value,
  transform: [
    { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
    { scale: value.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) },
  ],
});

export function useScreenIntro({ distance = 24, scaleFrom = 0.98 } = {}) {
  const valueRef = useRef(new Animated.Value(introPlayed ? 1 : 0));
  const value = valueRef.current;

  useEffect(() => {
    if (introPlayed) return;
    introPlayed = true;

    Animated.timing(value, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value]);

  return { style: rise(value, distance, scaleFrom) };
}
