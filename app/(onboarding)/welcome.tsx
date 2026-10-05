import { colors, typography } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Svg, { Defs, Ellipse, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* --------------------------- Animation helpers --------------------------- */

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * Looping 0 -> 1 value.
 * 'pingpong' eases 0 -> 1 -> 0 (duration each way).
 * 'cycle' runs linearly 0 -> 1, rests, then restarts.
 */
function useLoop(
  duration: number,
  mode: "pingpong" | "cycle" = "pingpong",
  delay = 0,
  rest = 0,
) {
  const reduce = useReduceMotion();
  const v = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (reduce) {
      v.setValue(0);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    const seq =
      mode === "pingpong"
        ? Animated.sequence([
            Animated.timing(v, {
              toValue: 1,
              duration,
              easing: ease,
              useNativeDriver: true,
            }),
            Animated.timing(v, {
              toValue: 0,
              duration,
              easing: ease,
              useNativeDriver: true,
            }),
          ])
        : Animated.sequence([
            Animated.timing(v, {
              toValue: 1,
              duration,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
            ...(rest > 0 ? [Animated.delay(rest)] : []),
          ]);
    const loop = Animated.loop(seq);
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [v, duration, mode, delay, rest, reduce]);

  return v;
}

/** One-shot 0 -> 1 entrance. */
function useReveal(delay = 0, duration = 800) {
  const reduce = useReduceMotion();
  const v = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const anim = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [v, delay, duration, reduce]);

  return v;
}

function Reveal({
  delay = 0,
  rise = 16,
  style,
  children,
}: {
  delay?: number;
  rise?: number;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const v = useReveal(delay);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            {
              translateY: v.interpolate({
                inputRange: [0, 1],
                outputRange: [rise, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ----------------------------- Floating card ----------------------------- */

type CardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tint: string;
  tintBg: string;
  duration: number;
  rotate: string;
  width: number;
  delay: number;
  large?: boolean;
  style: ViewStyle;
};

function FloatingCard({
  icon,
  title,
  subtitle,
  tint,
  tintBg,
  duration,
  rotate,
  width,
  delay,
  large,
  style,
}: CardProps) {
  const enter = useReveal(delay, 700);
  const float = useLoop(duration, "pingpong", delay + 600);

  const floatY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });
  const enterY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const enterScale = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const iconBox = large ? 40 : 30;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width,
          padding: large ? 11 : 9,
          borderRadius: large ? 20 : 16,
          opacity: enter,
          transform: [
            { rotate },
            { translateY: Animated.add(floatY, enterY) },
            { scale: enterScale },
          ],
        },
        style,
      ]}
    >
      <View
        style={{
          width: iconBox,
          height: iconBox,
          borderRadius: large ? 12 : 10,
          backgroundColor: tintBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={large ? 22 : 17} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.cardTitle, large && { fontSize: 14 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {title}
        </Text>
        <Text
          style={[styles.cardSub, large && { fontSize: 11 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="#A79DD6" />
    </Animated.View>
  );
}

/* ------------------------------ Decorations ------------------------------ */

// Soft radial glow faked with stacked translucent circles; slowly "breathes".
function Glow({
  size,
  color,
  style,
  duration = 6000,
  amp = 0.1,
}: {
  size: number;
  color: string;
  style: ViewStyle;
  duration?: number;
  amp?: number;
}) {
  const v = useLoop(duration, "pingpong");
  const scale = v.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1 + amp],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
        { transform: [{ scale }] },
      ]}
    >
      {[1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28, 0.16].map((k, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            width: size * k,
            height: size * k,
            borderRadius: (size * k) / 2,
            backgroundColor: color,
            opacity: 0.055,
          }}
        />
      ))}
    </Animated.View>
  );
}

// Thin light ring (the background swooshes); drifts and shimmers slowly.
function Ring({
  size,
  style,
  duration = 7000,
}: {
  size: number;
  style: ViewStyle;
  duration?: number;
}) {
  const v = useLoop(duration, "pingpong");
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.2)",
        },
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
          transform: [
            {
              translateY: v.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 6],
              }),
            },
          ],
        },
      ]}
    />
  );
}

// Twinkling light dot.
function Spark({ style, duration }: { style: ViewStyle; duration: number }) {
  const v = useLoop(duration, "pingpong");
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: "#FFFFFF",
          shadowColor: "#FFFFFF",
          shadowOpacity: 1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        },
        style,
        {
          opacity: v.interpolate({
            inputRange: [0, 1],
            outputRange: [0.25, 1],
          }),
          transform: [
            {
              scale: v.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1.35],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function OrbitRing({ rx, ry, pad }: { rx: number; ry: number; pad: number }) {
  const w = rx * 2 + pad * 2;
  const h = ry * 2 + pad * 2;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="orbitStroke" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.08} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.75} />
        </SvgGradient>
      </Defs>
      <Ellipse
        cx={w / 2}
        cy={h / 2}
        rx={rx}
        ry={ry}
        fill="none"
        stroke="url(#orbitStroke)"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

const TRAIL = [5, 4, 3, 2, 1, 0]; // tail first, head drawn last (on top)

// A dot travelling around the (rotated) orbit ellipse. Dims and shrinks on the
// far side of the orb so it feels like it goes behind it.
const N = 48;
function OrbitDot({
  progress,
  rx,
  ry,
  cx,
  cy,
  size,
  lag = 0,
  baseOpacity = 1,
}: {
  progress: Animated.Value;
  rx: number;
  ry: number;
  cx: number;
  cy: number;
  size: number;
  lag?: number;
  baseOpacity?: number;
}) {
  const { input, xs, ys, ops, scs } = useMemo(() => {
    const input = Array.from({ length: N + 1 }, (_, i) => i / N);
    const angle = (t: number) => (t - lag) * Math.PI * 2;
    return {
      input,
      xs: input.map((t) => Math.cos(angle(t)) * rx),
      ys: input.map((t) => Math.sin(angle(t)) * ry),
      ops: input.map(
        (t) => baseOpacity * (0.3 + 0.7 * ((Math.sin(angle(t)) + 1) / 2)),
      ),
      scs: input.map((t) => 0.65 + 0.45 * ((Math.sin(angle(t)) + 1) / 2)),
    };
  }, [rx, ry, lag, baseOpacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#FFFFFF",
        shadowColor: "#FFFFFF",
        shadowOpacity: 1,
        shadowRadius: size > 6 ? 10 : 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
        opacity: progress.interpolate({ inputRange: input, outputRange: ops }),
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: input,
              outputRange: xs,
            }),
          },
          {
            translateY: progress.interpolate({
              inputRange: input,
              outputRange: ys,
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: input,
              outputRange: scs,
            }),
          },
        ],
      }}
    />
  );
}

// Expanding ring that pulses outward from the orb, like a scan ping.
function Halo({
  size,
  left,
  top,
  delay,
}: {
  size: number;
  left: number;
  top: number;
  delay: number;
}) {
  const p = useLoop(3200, "cycle", delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.9)",
        backgroundColor: "rgba(255,255,255,0.06)",
        opacity: p.interpolate({
          inputRange: [0, 0.15, 1],
          outputRange: [0, 0.55, 0],
        }),
        transform: [
          {
            scale: p.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.55],
            }),
          },
        ],
      }}
    />
  );
}

function Cloud({
  style,
  scale = 1,
  drift = 12,
  duration = 7000,
}: {
  style: ViewStyle;
  scale?: number;
  drift?: number;
  duration?: number;
}) {
  const v = useLoop(duration, "pingpong");
  const s = (n: number) => n * scale;
  return (
    <Animated.View
      style={[
        { position: "absolute", width: s(190), height: s(90) },
        style,
        {
          transform: [
            {
              translateX: v.interpolate({
                inputRange: [0, 1],
                outputRange: [0, drift],
              }),
            },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.puff,
          { left: 0, bottom: s(-20), width: s(100), height: s(100) },
        ]}
      />
      <View
        style={[
          styles.puff,
          { left: s(55), bottom: s(-4), width: s(96), height: s(96) },
        ]}
      />
      <View
        style={[
          styles.puff,
          { left: s(115), bottom: s(-22), width: s(76), height: s(76) },
        ]}
      />
    </Animated.View>
  );
}

/* --------------------------------- Screen -------------------------------- */

export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const heroH = Math.round(height * 0.64);
  const cy = height * 0.285; // vertical centre of the orb

  const ORB = Math.round(width * 0.37);
  const INNER = Math.round(ORB * 0.86);
  const orbLeft = width / 2 - ORB / 2;
  const orbTop = cy - ORB / 2;

  const bigCard = Math.round(width * 0.43);
  const smallCard = Math.round(width * 0.37);

  // Orbit ellipse geometry (ring and dot share these numbers)
  const ORX = ORB * 1.3; // half-width
  const ORY = ORB * 0.62; // half-height
  const PAD = 4;
  const OW = ORX * 2 + PAD * 2;
  const OH = ORY * 2 + PAD * 2;

  const orbit = useLoop(9000, "cycle"); // one lap every 9s
  const breath = useLoop(2600, "pingpong");
  const orbEnter = useReveal(0, 900);
  const orbScale = Animated.multiply(
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }),
    orbEnter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
  );

  // CTA shine sweep + arrow nudge
  const btnW = Math.min(width * 0.62, 280);
  const shine = useLoop(1100, "cycle", 2000, 3200);
  const nudge = useLoop(800, "pingpong", 1800);

  const openAuth = (mode: "login" | "signup") =>
    router.push({ pathname: "/auth", params: { mode } });

  return (
    <LinearGradient
      colors={["#8D7BFF", "#A395FF", "#C6AAF9", "#F1EAFF", "#FFFFFF"]}
      locations={[0, 0.17, 0.3, 0.4, 0.48]}
      style={styles.container}
    >
      {/* Faint lavender hills at the very bottom */}
      <View
        pointerEvents="none"
        style={[
          styles.hill,
          {
            left: -width * 0.45,
            bottom: -width * 0.75,
            width: width * 1.1,
            height: width * 1.1,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.hill,
          {
            right: -width * 0.5,
            bottom: -width * 0.8,
            width: width * 1.1,
            height: width * 1.1,
          },
        ]}
      />

      {/* ------------------------------ Hero ------------------------------ */}
      <View style={[styles.hero, { height: heroH }]}>
        {/* Soft glows (breathing) */}
        <Glow
          size={width * 0.9}
          color="#F6B9F2"
          duration={5200}
          amp={0.12}
          style={{ right: -width * 0.35, top: height * 0.05 }}
        />
        <Glow
          size={width * 0.8}
          color="#7F6BFF"
          duration={6400}
          amp={0.1}
          style={{ left: -width * 0.3, top: -height * 0.04 }}
        />
        <Glow
          size={width * 0.7}
          color="#FFFFFF"
          duration={4200}
          amp={0.08}
          style={{ left: width * 0.15, top: cy - width * 0.35 }}
        />

        {/* Light swooshes (slow drift) */}
        <Ring
          size={width * 1.15}
          duration={7000}
          style={{ right: -width * 0.55, top: -width * 0.45 }}
        />
        <Ring
          size={width * 0.95}
          duration={8500}
          style={{ right: -width * 0.5, top: -width * 0.28 }}
        />
        <Ring
          size={width * 1.1}
          duration={9500}
          style={{ left: -width * 0.8, top: height * 0.17 }}
        />

        {/* Orbit ring with comet */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: width / 2 - OW / 2,
            top: cy - OH / 2,
            width: OW,
            height: OH,
            transform: [{ rotate: "-14deg" }],
          }}
        >
          <OrbitRing rx={ORX} ry={ORY} pad={PAD} />
          {TRAIL.map((i) => (
            <OrbitDot
              key={i}
              progress={orbit}
              rx={ORX}
              ry={ORY}
              cx={ORX + PAD}
              cy={ORY + PAD}
              size={i === 0 ? 8 : 8 - i * 1.1}
              lag={i * 0.014}
              baseOpacity={i === 0 ? 1 : 1 - i * 0.17}
            />
          ))}
        </View>

        {/* Twinkling dots */}
        <Spark duration={1600} style={{ left: width * 0.28, top: cy - 8 }} />
        <Spark
          duration={2200}
          style={{ left: width * 0.47, top: cy + ORB * 0.62 }}
        />
        <Spark
          duration={1900}
          style={{ left: width * 0.74, top: cy - ORB * 0.45 }}
        />

        {/* Clouds (slow drift) */}
        <Cloud
          style={{ left: -width * 0.1, bottom: 85 }}
          scale={1.15}
          drift={14}
          duration={7500}
        />
        <Cloud
          style={{ right: -width * 0.12, bottom: 85 }}
          scale={1.3}
          drift={-14}
          duration={8500}
        />
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.85)", "#FFFFFF", "#FFFFFF"]}
          locations={[0, 0.55, 0.1, 1]}
          style={styles.bottomFade}
        />

        {/* Pulse halos */}
        <Halo size={ORB} left={orbLeft} top={orbTop} delay={600} />
        <Halo size={ORB} left={orbLeft} top={orbTop} delay={2200} />

        {/* Glass orb (breathing) */}
        <Animated.View
          style={[
            styles.orb,
            {
              width: ORB,
              height: ORB,
              borderRadius: ORB / 2,
              left: orbLeft,
              top: orbTop,
              opacity: orbEnter,
              transform: [{ scale: orbScale }],
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.98)", "rgba(232,223,255,0.85)"]}
            style={{
              width: INNER,
              height: INNER,
              borderRadius: INNER / 2,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.95)",
              shadowColor: colors.primary,
              shadowOpacity: 0.28,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
              overflow: "hidden",
            }}
          >
            <Image
              source={require("../../assets/images/nestly.png")}
              style={{
                width: INNER * 0.82,
                height: INNER * 0.82,
                borderRadius: (INNER * 0.82) / 2,
              }}
              resizeMode="cover"
            />
          </LinearGradient>
        </Animated.View>

        {/* Floating cards (staggered entrance, then float) */}
        <FloatingCard
          large
          icon="qr-code-outline"
          title="Visitor pass"
          subtitle="Until 6 PM"
          tint={colors.primary}
          tintBg="#E6DEFF"
          duration={2400}
          rotate="8deg"
          width={bigCard}
          delay={200}
          style={{ left: width * 0.03, top: height * 0.140 }}
        />
        <FloatingCard
          icon="checkmark-circle"
          title="Approved"
          subtitle="Gate 1 · 2:14"
          tint={colors.success}
          tintBg="#DDF5E6"
          duration={2800}
          rotate="-8deg"
          width={smallCard}
          delay={350}
          style={{ right: width * 0.05, top: height * 0.17 }}
        />
        <FloatingCard
          icon="scan-outline"
          title="Gate scan"
          subtitle="Verified 1s"
          tint={colors.info}
          tintBg="#DCEBFF"
          duration={2600}
          rotate="-8deg"
          width={smallCard}
          delay={500}
          style={{ left: width * 0.08, top: height * 0.33 }}
        />
        <FloatingCard
          icon="person-add-outline"
          title="New request"
          subtitle="Unit 12B"
          tint={colors.warning}
          tintBg="#FFEBC7"
          duration={3000}
          rotate="8deg"
          width={smallCard}
          delay={650}
          style={{ right: width * 0.06, top: height * 0.35 }}
        />
      </View>

      {/* ----------------------------- Content ---------------------------- */}
      <View
        style={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 205 },
        ]}
      >
        <Reveal delay={600}>
          <View style={styles.tag}>
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={colors.primary}
            />
            <Text style={styles.tagText}>Visitor access, simplified</Text>
          </View>
        </Reveal>

        <Reveal delay={750}>
          <Text style={styles.title}>Your estate.</Text>
          <Text style={[styles.title, { color: colors.primary }]}>
            Your access.
          </Text>
        </Reveal>

        <Reveal delay={900}>
          <Text style={styles.subtitle}>
            Create visitor passes, verify them at the gate, and keep every visit
            securely recorded.
          </Text>
        </Reveal>

        <Reveal delay={1050} rise={20}>
          <Pressable
            onPress={() => openAuth("signup")}
            style={({ pressed }) => [
              styles.ctaWrap,
              {
                width: btnW,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={["#7653FF", "#5B3BF0"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Get started</Text>
              <Animated.View
                style={{
                  transform: [
                    {
                      translateX: nudge.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 5],
                      }),
                    },
                  ],
                }}
              >
                <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
              </Animated.View>

              {/* Light sweep across the button */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -12,
                  bottom: -12,
                  width: 46,
                  transform: [
                    {
                      translateX: shine.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-80, btnW + 40],
                      }),
                    },
                    { rotate: "20deg" },
                  ],
                }}
              >
                <LinearGradient
                  colors={[
                    "rgba(255,255,255,0)",
                    "rgba(255,255,255,0.32)",
                    "rgba(255,255,255,0)",
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>
            </LinearGradient>
          </Pressable>
        </Reveal>
      </View>
    </LinearGradient>
  );
}

/* --------------------------------- Styles -------------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  hero: {
    width: "100%",
    overflow: "hidden",
  },
  hill: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(196,181,255,0.16)",
  },
  puff: {
    position: "absolute",
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.72)",
    shadowColor: "#9B86FF",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 170,
  },
  orb: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.26)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#7A5CFF",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardTitle: { fontSize: 12, fontWeight: "700", color: colors.text },
  cardSub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(237,231,255,0.9)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 17,
  },
  tagText: { fontSize: 12, fontWeight: "800", color: colors.primary },
title: {
  ...typography.h1,
  fontFamily: "PlusJakartaSans_800ExtraBold",
  fontSize: 45,
  lineHeight: 44,
  letterSpacing: -0.5,
  color: "#0F0A2E",
  textAlign: "center",
  textShadowColor: "#0F0A2E",
  textShadowOffset: { width: 0.5, height: 0 },
  textShadowRadius: 0.8,
},
  subtitle: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 20,
    color: "#6F6A8F",
    textAlign: "center",
    maxWidth: 300,
    marginTop: 15,
  },
  ctaWrap: {
    marginTop: 21,
    borderRadius: 999,
    shadowColor: "#5B3BF0",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cta: {
    height: 54,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  ctaText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
