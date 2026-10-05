import React, { useEffect, useMemo } from 'react';
import { Animated, Dimensions, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const COUNT = 6;

export default function BackgroundBubbles() {
  const { width, height } = Dimensions.get('screen');

  const presets = useMemo(() => {
    const big = Math.round(width * 0.54);
    const med = Math.round(width * 0.38);
    const small = Math.round(width * 0.24);
    return [
      { size: big,   cx: 0.08, cy: 0.02, colors: ['rgba(108,71,255,0.12)', 'rgba(91,60,240,0.07)'] },
      { size: big,   cx: 0.82, cy: 0.16, colors: ['rgba(74,222,128,0.09)', 'rgba(22,163,74,0.05)'] },
      { size: big, cx: 0.98, cy: 0.50, colors: ['rgba(124,92,255,0.08)', 'rgba(124,92,255,0.03)'] },
      { size: big,   cx: 0.30, cy: 0.9, colors: ['rgba(242,177,68,0.11)', 'rgba(60,46,153,0.05)'] },
      { size: big,   cx: 0.95, cy: 1.0,  colors: ['rgba(91,60,240,0.08)', 'rgba(140,111,255,0.04)'] },
      { size: big, cx: 0.20, cy: 0.30, colors: ['rgba(124,92,255,0.07)', 'rgba(100,87,255,0.03)'] },
    ].map((p) => ({
      ...p,
      left: p.cx * width - p.size / 2,
      top: p.cy * height - p.size / 2,
    }));
  }, [width, height]);

  const anims = useMemo(
    () => Array.from({ length: COUNT }, () => ({ x: new Animated.Value(0), y: new Animated.Value(0) })),
    []
  );

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    anims.forEach((a, i) => {
      const pingPong = (v: Animated.Value, dur: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        );
      const lx = pingPong(a.x, 9000 + i * 1700);
      const ly = pingPong(a.y, 11000 + i * 1300);
      lx.start();
      ly.start();
      loops.push(lx, ly);
    });
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <Animated.View pointerEvents="none" style={[styles.root, { width, height }]}>
      {presets.map((p, i) => {
        const amp = Math.max(24, p.size * 0.18);
        const tx = anims[i].x.interpolate({ inputRange: [0, 1], outputRange: [-amp, amp] });
        const ty = anims[i].y.interpolate({ inputRange: [0, 1], outputRange: [amp, -amp] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.circle,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                left: p.left,
                top: p.top,
                transform: [{ translateX: tx }, { translateY: ty }],
              },
            ]}
          >
            <LinearGradient
              colors={p.colors as [string, string]}
              style={{ flex: 1, borderRadius: p.size / 2 }}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  circle: { position: 'absolute' },
});