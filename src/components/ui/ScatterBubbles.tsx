import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

// x and y are fractions of the screen (0 to 1). size is a fraction of the screen width.
const BUBBLES = [
  { x: 0.06, y: 0.05, size: 0.34, o: 0.1 },
  { x: 0.78, y: 0.09, size: 0.18, o: 0.12 },
  { x: 0.52, y: 0.17, size: 0.1, o: 0.09 },
  { x: 0.9, y: 0.32, size: 0.3, o: 0.08 },
  { x: 0.03, y: 0.4, size: 0.14, o: 0.12 },
  { x: 0.42, y: 0.5, size: 0.22, o: 0.07 },
  { x: 0.8, y: 0.62, size: 0.12, o: 0.12 },
  { x: 0.1, y: 0.7, size: 0.28, o: 0.09 },
  { x: 0.6, y: 0.78, size: 0.16, o: 0.1 },
  { x: 0.88, y: 0.9, size: 0.34, o: 0.09 },
  { x: 0.3, y: 0.92, size: 0.12, o: 0.12 },
];

function Bubble({
  left,
  top,
  d,
  o,
  delay,
  dur,
}: {
  left: number;
  top: number;
  d: number;
  o: number;
  delay: number;
  dur: number;
}) {
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [t, dur, delay]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: `rgba(124,92,255,${o})`,
        borderWidth: 1,
        borderColor: `rgba(124,92,255,${o + 0.04})`,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }],
      }}
    />
  );
}

export default function ScatterBubbles() {
  const { width, height } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BUBBLES.map((b, i) => {
        const d = width * b.size;
        return (
          <Bubble
            key={i}
            left={width * b.x - d / 2}
            top={height * b.y - d / 2}
            d={d}
            o={b.o}
            delay={i * 250}
            dur={3200 + (i % 4) * 700}
          />
        );
      })}
    </View>
  );
}
