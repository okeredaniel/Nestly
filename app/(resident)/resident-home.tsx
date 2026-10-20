import AppModal from "@/components/ui/AppModal";
import AppTextField from "@/components/ui/AppTextField";
import BottomCard, { SheetTitle } from "@/components/ui/BottomCard";
import LogoutButton from "@/components/ui/LogoutButton";
import PrimaryButton from "@/components/ui/PrimaryButton";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { useAuth } from "@/context/AuthContext";
import { useScreenIntro } from "@/hooks/useScreenIntro";
import { db } from "@/lib/firebase";
import { enqueueOfflineAction, getOfflineQueueSummary } from "@/lib/offlineQueue";
import { hasMapKey, staticMapUrl } from "@/lib/geoapify";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import { SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useNetInfo } from "@react-native-community/netinfo";
import * as Sharing from "expo-sharing";
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  LayoutChangeEvent,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, typography } from "../../src/theme";

type IconName = keyof typeof Ionicons.glyphMap;
type PassStatus = "active" | "used" | "cancelled";
type EffStatus = PassStatus | "expired";
type Pass = {
  id: string;
  visitorName: string;
  code: string;
  validUntil: number;
  status: PassStatus;
  usedAt: number;
};

const STAGE_HEIGHT = 290; // map stage under the status bar
const SHEET_LIFT = 34; // how far the white sheet climbs over the stage
const APP_QR_SIZE = 230;

// Floating nav (same look as the admin tab bar).
type NavKey = "home" | "book" | "report" | "alert" | "history";
type NavItemDef = { key: NavKey; label: string; on: IconName; off: IconName };
const NAV_ITEMS: NavItemDef[] = [
  { key: "home", label: "Home", on: "home", off: "home-outline" },
  { key: "book", label: "Book", on: "calendar", off: "calendar-outline" },
  { key: "report", label: "Report", on: "construct", off: "construct-outline" },
  { key: "alert", label: "Alert", on: "alert-circle", off: "alert-circle-outline" },
  { key: "history", label: "History", on: "time", off: "time-outline" },
];

const BAR_HEIGHT = 76;
const PILL_HEIGHT = 56;
const NAV_PAD = 8;
const NAV_BORDER = 1;
const OVERHANG = 8;
const NAV_MAX_WIDTH = 420;

// Keep only two quick presets; 'Custom' handled separately
const DURATIONS: { key: string; label: string; until: () => number }[] = [
  { key: "2h", label: "2 hours", until: () => Date.now() + 2 * 3600 * 1000 },
  { key: "24h", label: "24 hours", until: () => Date.now() + 24 * 3600 * 1000 },
];

const MAX_HOURS = 72;
const maxFor = (unit: "hours" | "days") =>
  unit === "hours" ? MAX_HOURS : MAX_HOURS / 24;

const STATUS_TAG: Record<EffStatus, { label: string; fg: string; bg: string }> =
  {
    active: { label: "Active", fg: "#17653A", bg: "#DDF5E6" },
    used: { label: "Used", fg: "#3C2A99", bg: "#EAE4FF" },
    cancelled: { label: "Cancelled", fg: "#55556A", bg: "#EEEEF2" },
    expired: { label: "Expired", fg: "#8A5A00", bg: "#FFF1D6" },
  };

/* --------------------------------- Helpers -------------------------------- */

const ms = (v: any): number =>
  v?.toMillis ? v.toMillis() : typeof v === "number" ? v : 0;

const newCode = () =>
  String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
const fmtCode = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

const validLabel = (t: number) => {
  const d = new Date(t);
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (d.toDateString() === new Date().toDateString()) return `${time} today`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
};

const effStatus = (p: Pass, now: number): EffStatus =>
  p.status === "active" && p.validUntil <= now ? "expired" : p.status;

const statusLine = (p: Pass, now: number) => {
  const s = effStatus(p, now);
  if (s === "active") return `Valid until ${validLabel(p.validUntil)}`;
  if (s === "used") return p.usedAt ? `Used ${validLabel(p.usedAt)}` : "Used";
  if (s === "cancelled") return "Cancelled";
  return `Expired ${validLabel(p.validUntil)}`;
};

// When a past pass "happened": used time, otherwise its expiry.
const passTime = (p: Pass) => p.usedAt || p.validUntil;

const dayLabel = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
};

type HistoryFilter = "all" | "used" | "expired" | "cancelled";
const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "used", label: "Used" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
];

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

/* ------------------------------- Small parts ------------------------------ */

function SectionHeader({
  title,
  onSeeAll,
  seeAllLabel = "See all",
}: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={styles.seeAll} hitSlop={8}>
          <Text style={styles.seeAllText}>{seeAllLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

function Chip({
  icon,
  label,
  tint,
  bg,
}: {
  icon: IconName;
  label: string;
  tint: string;
  bg: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[styles.chipText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function FloatingNav({
  active,
  onPress,
  bottom,
}: {
  active: NavKey;
  onPress: (k: NavKey) => void;
  bottom: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const count = NAV_ITEMS.length;
  const focusedIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((n) => n.key === active),
  );

  const [innerWidth, setInnerWidth] = useState(0);
  const slot = innerWidth > 0 ? (innerWidth - NAV_PAD * 2) / count : 0;
  const posRef = useRef(new Animated.Value(focusedIndex));
  const pos = posRef.current;

  useEffect(() => {
    if (!slot) return;
    Animated.spring(pos, {
      toValue: focusedIndex,
      damping: 15,
      stiffness: 170,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [focusedIndex, slot, pos]);

  const barWidth = Math.min(screenW - 32, NAV_MAX_WIDTH, count * 84 + NAV_PAD * 2);
  const pillWidth = slot + OVERHANG;
  const x0 = NAV_PAD + slot * 0.5 - pillWidth / 2;
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [x0, x0 + slot],
    extrapolate: "extend",
  });

  const input: number[] = [];
  const output: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    input.push(i, i + 0.5);
    output.push(1, 1.16);
  }
  input.push(count - 1);
  output.push(1);
  const scaleX = pos.interpolate({ inputRange: input, outputRange: output });

  return (
    <View style={[styles.navWrap, { bottom }]} pointerEvents="box-none">
      <View style={[styles.navBar, { width: barWidth }]}>
        <View
          style={styles.navInner}
          onLayout={(e: LayoutChangeEvent) =>
            setInnerWidth(e.nativeEvent.layout.width)
          }
        >
          {slot > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pillGlow,
                { width: pillWidth, transform: [{ translateX }, { scaleX }] },
              ]}
            >
              <View style={styles.pillClip}>
                <LinearGradient
                  colors={["#9A82FF", "#5B3CF0"]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={["rgba(255,255,255,0.38)", "rgba(255,255,255,0)"]}
                  style={styles.pillShine}
                />
              </View>
            </Animated.View>
          )}

          {NAV_ITEMS.map((item, i) => {
            const onOpacity = pos.interpolate({
              inputRange: [i - 1, i, i + 1],
              outputRange: [0, 1, 0],
              extrapolate: "clamp",
            });
            const offOpacity = Animated.subtract(1, onOpacity);
            return (
              <Pressable
                key={item.key}
                onPress={() => onPress(item.key)}
                style={styles.navItem}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active === item.key }}
              >
                <View style={styles.iconBox}>
                  <Animated.View style={[styles.layer, { opacity: offOpacity }]}>
                    <Ionicons name={item.off} size={23} color={colors.textMuted} />
                  </Animated.View>
                  <Animated.View style={[styles.layer, { opacity: onOpacity }]}>
                    <Ionicons name={item.on} size={22} color="#FFFFFF" />
                  </Animated.View>
                </View>
                <View style={styles.labelBox}>
                  <Animated.Text
                    numberOfLines={1}
                    style={[styles.navLabel, { color: colors.textMuted, opacity: offOpacity }]}
                  >
                    {item.label}
                  </Animated.Text>
                  <Animated.Text
                    numberOfLines={1}
                    style={[styles.navLabel, { color: "#FFFFFF", opacity: onOpacity }]}
                  >
                    {item.label}
                  </Animated.Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// Six code boxes that pop in one after another, matching the guard's entry screen.
function CodeBoxes({ code }: { code: string }) {
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const avail = Math.min(width - 88, 300);
  const w = Math.floor((avail - 8 * 5) / 6);
  const h = Math.round(w * 1.3);
  const pops = useMemo(
    () => Array.from({ length: 6 }, () => new Animated.Value(0)),
    [],
  );

  useEffect(() => {
    if (reduce) {
      pops.forEach((p) => p.setValue(1));
      return;
    }
    const anim = Animated.stagger(
      70,
      pops.map((p) =>
        Animated.timing(p, {
          toValue: 1,
          duration: 320,
          easing: Easing.bezier(0.2, 0.9, 0.3, 1.4),
          useNativeDriver: true,
        }),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [pops, reduce]);

  return (
    <View style={styles.boxesRow}>
      {code.split("").map((ch, i) => (
        <Animated.View
          key={i}
          style={[
            styles.box,
            {
              width: w,
              height: h,
              borderRadius: Math.round(w * 0.34),
              opacity: pops[i],
              transform: [
                {
                  scale: pops[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
                {
                  translateY: pops[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.boxText, { fontSize: Math.round(w * 0.55) }]}>
            {ch}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

function PassRow({
  pass,
  status,
  onPress,
}: {
  pass: Pass;
  status: EffStatus;
  onPress: () => void;
}) {
  const tag = STATUS_TAG[status];
  const live = status === "active";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.passRow,
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={[styles.passIcon, !live && { backgroundColor: "#ECEAF2" }]}>
        <Ionicons
          name="qr-code-outline"
          size={22}
          color={live ? colors.primary : colors.textMuted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.passName, !live && { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {pass.visitorName}
        </Text>
        <Text style={styles.passMeta} numberOfLines={1}>
          {live ? `Until ${validLabel(pass.validUntil)}` : tag.label}
        </Text>
      </View>
      {live ? (
        <View style={styles.codePill}>
          <Text style={styles.codePillText}>{fmtCode(pass.code)}</Text>
        </View>
      ) : (
        <View style={[styles.tag, { backgroundColor: tag.bg }]}>
          <Text style={[styles.tagText, { color: tag.fg }]}>{tag.label}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function HistoryRow({
  pass,
  status,
  now,
  onPress,
}: {
  pass: Pass;
  status: EffStatus;
  now: number;
  onPress: () => void;
}) {
  const tag = STATUS_TAG[status];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.histRow, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.histName} numberOfLines={1}>
          {pass.visitorName}
        </Text>
        <Text style={styles.histMeta} numberOfLines={1}>
          <Text style={styles.histCode}>{fmtCode(pass.code)}</Text>
          {"  ·  "}
          {statusLine(pass, now)}
        </Text>
      </View>
      <View style={[styles.tag, { backgroundColor: tag.bg }]}>
        <Text style={[styles.tagText, { color: tag.fg }]}>{tag.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */

export default function ResidentHome() {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const netInfo = useNetInfo();
  const { profile, user, signOut } = useAuth();
  const [pendingSync, setPendingSync] = useState(0);
  const [estate, setEstate] = useState<{
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
  } | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  // The text is kept after a modal closes, so it doesn't change while the modal fades out.
  const [notice, setNotice] = useState({ title: "", message: "" });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [errorInfo, setErrorInfo] = useState({ title: "", message: "" });
  const [errorOpen, setErrorOpen] = useState(false);

  const [passes, setPasses] = useState<Pass[]>([]);
  const [passesError, setPassesError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<"create" | "view" | "history">(
    "create",
  );
  const [selected, setSelected] = useState<Pass | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [fromHistory, setFromHistory] = useState(false);
  const scrollYRef = useRef(new Animated.Value(0));
  const scrollY = scrollYRef.current;
  const [headerHidden, setHeaderHidden] = useState(false);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const headerShift = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -40],
    extrapolate: "clamp",
  });

  const [visitorName, setVisitorName] = useState("");
  const [duration, setDuration] = useState(DURATIONS[0].key);
  const [customAmount, setCustomAmount] = useState(3);
  const [customUnit, setCustomUnit] = useState<"hours" | "days">("hours");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Pass | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const qrRef = useRef<any>(null);

  useEffect(() => {
    if (!profile?.estateId) return;
    return onSnapshot(
      doc(db, "estates", profile.estateId),
      (snap) => {
        const d = snap.data();
        if (d)
          setEstate({
            name: d.name,
            address: d.address || "",
            lat: typeof d.lat === "number" ? d.lat : null,
            lng: typeof d.lng === "number" ? d.lng : null,
          });
      },
      () => {},
    );
  }, [profile?.estateId]);

  // Keep "expired" fresh without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Live list of this resident's passes.
  useEffect(() => {
    const estateId = profile?.estateId;
    const uid = user?.uid;
    if (!estateId || !uid) return;
    return onSnapshot(
      query(
        collection(db, "visitorTokens"),
        where("estateId", "==", estateId),
        where("residentId", "==", uid),
      ),
      (snap) => {
        setPassesError("");
        setPasses(
          snap.docs.map((d) => {
            const u = d.data({ serverTimestamps: "estimate" });
            return {
              id: d.id,
              visitorName: u.visitorName || "Visitor",
              code: String(u.code || ""),
              validUntil: ms(u.validUntil),
              status: (u.status as PassStatus) || "active",
              usedAt: ms(u.usedAt),
            };
          }),
        );
      },
      (err) => {
        console.warn("Passes query failed:", err.code, err.message);
        setPassesError(err.code);
      },
    );
  }, [profile?.estateId, user?.uid]);

  useEffect(() => {
    let active = true;
    const refreshPending = async () => {
      const summary = await getOfflineQueueSummary();
      if (active) setPendingSync(summary.total);
    };
    void refreshPending();
    return () => {
      active = false;
    };
  }, [netInfo?.isConnected]);

  const { active, past, history, visitorsToday } = useMemo(() => {
    const act: Pass[] = [];
    const old: Pass[] = [];
    let usedToday = 0;
    const today = new Date(now).toDateString();
    passes.forEach((p) => {
      if (p.status === "active" && p.validUntil > now) act.push(p);
      else old.push(p);
      if (
        p.status === "used" &&
        p.usedAt &&
        new Date(p.usedAt).toDateString() === today
      ) {
        usedToday += 1;
      }
    });
    act.sort((a, b) => a.validUntil - b.validUntil);
    old.sort((a, b) => passTime(b) - passTime(a));
    return {
      active: act,
      past: old.slice(0, 3),
      history: old,
      visitorsToday: usedToday,
    };
  }, [passes, now]);

  const historyCounts = useMemo(() => {
    const c: Record<HistoryFilter, number> = {
      all: history.length,
      used: 0,
      expired: 0,
      cancelled: 0,
    };
    history.forEach((p) => {
      c[effStatus(p, now) as Exclude<EffStatus, "active">] += 1;
    });
    return c;
  }, [history, now]);

  // Past passes for the chosen filter, grouped by day (newest first).
  const historyGroups = useMemo(() => {
    const groups: { label: string; items: Pass[] }[] = [];
    history
      .filter(
        (p) => historyFilter === "all" || effStatus(p, now) === historyFilter,
      )
      .forEach((p) => {
        const label = dayLabel(passTime(p));
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(p);
        else groups.push({ label, items: [p] });
      });
    return groups;
  }, [history, historyFilter, now]);

  const customHours = customUnit === "hours" ? customAmount : customAmount * 24;

  const bumpCustom = (delta: number) =>
    setCustomAmount((n) =>
      Math.min(maxFor(customUnit), Math.max(1, n + delta)),
    );

  const switchUnit = (unit: "hours" | "days") => {
    if (unit === customUnit) return;
    setCustomAmount((n) =>
      unit === "days"
        ? Math.min(maxFor("days"), Math.max(1, Math.round(n / 24)))
        : Math.min(MAX_HOURS, n * 24),
    );
    setCustomUnit(unit);
  };

  const activePasses = active.length;
  const livePass = selected
    ? (passes.find((p) => p.id === selected.id) ?? selected)
    : null;

  const handleLogout = async () => {
    setShowLogout(false);
    await signOut();
  };

  const openMaps = () => {
    const q = estate?.address || estate?.name;
    if (!q) return;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    ).catch(() => {});
  };

  /* ---- sheet actions ---- */
  const openCreate = () => {
    setVisitorName("");
    setDuration(DURATIONS[0].key);
    setCustomAmount(3);
    setCustomUnit("hours");
    setFormError("");
    setSheetMode("create");
    setSheetVisible(true);
  };

  const openPass = (p: Pass, fromHist = false) => {
    setSelected(p);
    setFromHistory(fromHist);
    setSheetMode("view");
    setSheetVisible(true);
  };

  const openHistory = () => {
    setHistoryFilter("all");
    setFromHistory(false);
    setSheetMode("history");
    setSheetVisible(true);
  };

  // Pill rests on Home; it slides to History while the history sheet is open.
  const navActive: NavKey =
    sheetVisible && sheetMode === "history" ? "history" : "home";

  const onNav = (key: NavKey) => {
    if (key === "home") return;
    if (key === "history") return openHistory();
    if (key === "report") return router.push("/(resident)/report" as any);
    if (key === "book") return router.push("/(resident)/book" as any);
    if (key === "alert") return router.push("/(resident)/alert" as any);
  };

  const createPass = async () => {
    const name = visitorName.trim();
    if (name.length < 2) {
      setFormError("Enter your visitor’s name");
      return;
    }
    const estateId = profile?.estateId;
    if (!estateId || !user) {
      setFormError("Your account is not linked to an estate");
      return;
    }

    setCreating(true);
    setFormError("");
    const validUntil =
      duration === "custom"
        ? Date.now() + customHours * 3600 * 1000
        : (DURATIONS.find((d) => d.key === duration) ?? DURATIONS[0]).until();

    try {
      const networkAvailable = netInfo?.isConnected !== false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = newCode();
        const tokenRef = doc(collection(db, "visitorTokens"));
        const lockRef = doc(db, "visitorCodes", `${estateId}_${code}`);

        try {
          if (networkAvailable) {
            await runTransaction(db, async (tx) => {
              const lock = await tx.get(lockRef);
              if (lock.exists() && ms(lock.data().expiresAt) > Date.now()) {
                throw new Error("code-taken");
              }
              tx.set(lockRef, {
                estateId,
                code,
                tokenId: tokenRef.id,
                expiresAt: Timestamp.fromMillis(validUntil),
              });
              tx.set(tokenRef, {
                estateId,
                residentId: user.uid,
                hostName: profile?.name || "",
                unit: profile?.unit || "",
                code,
                visitorName: name,
                status: "active",
                validUntil: Timestamp.fromMillis(validUntil),
                createdAt: serverTimestamp(),
              });
            });

            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            ).catch(() => {});
            setSelected({
              id: tokenRef.id,
              visitorName: name,
              code,
              validUntil,
              status: "active",
              usedAt: 0,
            });
            setSheetMode("view");
            return;
          }

          await enqueueOfflineAction({
            id: `${Date.now()}-${attempt}`,
            kind: "create-pass",
            estateId,
            residentId: user.uid,
            hostName: profile?.name || "",
            unit: profile?.unit || "",
            code,
            visitorName: name,
            validUntil,
            createdAt: Date.now(),
          });
          setSelected({
            id: `${Date.now()}-${attempt}`,
            visitorName: name,
            code,
            validUntil,
            status: "active",
            usedAt: 0,
          });
          setSheetMode("view");
          return;
        } catch (e: any) {
          if (e?.message !== "code-taken") throw e;
        }
      }
      setFormError("Could not find a free code. Please try again.");
    } catch (e: any) {
      console.warn("Create pass failed:", e?.code, e?.message);
      setFormError(
        e?.code === "permission-denied"
          ? "Not allowed. Check that your account is approved as a resident."
          : "Could not create the pass. Check your connection and try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  const sharePass = (p: Pass) => {
    const first = p.visitorName.trim().split(" ")[0];
    Share.share({
      message:
        `Hi ${first}, here is your visitor pass for ${estate?.name ?? "the estate"}.\n` +
        `Code: ${fmtCode(p.code)}\n` +
        `Valid until ${validLabel(p.validUntil)}.\n` +
        `Show this code to security at the gate.`,
    }).catch(() => {});
  };

  const shareQr = async () => {
    if (!qrRef.current || !livePass) return;
    qrRef.current.toDataURL(async (base64: string) => {
      try {
        const sourceUri = `${FileSystem.cacheDirectory}pass-${livePass.id}.png`;
        await FileSystem.writeAsStringAsync(sourceUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const resized = await ImageManipulator.manipulateAsync(
          sourceUri,
          [{ resize: { width: 1200, height: 1200 } }],
          { compress: 0.9, format: SaveFormat.PNG },
        );

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(resized.uri, {
            mimeType: "image/png",
            dialogTitle: "Share visitor pass",
            UTI: "public.png",
          });
        }
      } catch (e) {
        console.warn("Share QR failed:", e);
      }
    });
  };

  const askCancel = () => {
    if (!livePass) return;
    setCancelTarget(livePass);
    setCancelOpen(true);
    setSheetVisible(false);
  };

  const confirmCancel = async () => {
    const p = cancelTarget;
    setCancelOpen(false);
    if (!p) return;
    try {
      await updateDoc(doc(db, "visitorTokens", p.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
    } catch {
      setNoticeOpen(false);
      setErrorInfo({
        title: "Something went wrong",
        message: "Could not cancel this pass. Check your connection.",
      });
      setErrorOpen(true);
    }
  };

  const liveStatus = livePass ? effStatus(livePass, now) : "active";

  const stageH = STAGE_HEIGHT + insets.top;
  const mapUri =
    hasMapKey && estate?.lat != null && estate?.lng != null
      ? staticMapUrl(estate.lat, estate.lng, Math.min(screenW, 900), stageH)
      : null;

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#CDBDFF" }}>
      <AppModal
        visible={showLogout}
        title="Log out"
        message="Are you sure you want to log out of your estate account?"
        cancelText="Cancel"
        confirmText="Log out"
        confirmDanger
        onClose={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />

      <AppModal
        visible={cancelOpen}
        icon="close-circle"
        title="Cancel this pass"
        message={`Cancel ${cancelTarget?.visitorName ?? "this visitor"}'s pass? The code will stop working at the gate.`}
        cancelText="Keep pass"
        confirmText="Cancel pass"
        confirmDanger
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
      />

      <AppModal
        visible={noticeOpen}
        icon="information-circle"
        title={notice.title}
        message={notice.message}
        cancelText={null}
        confirmText="Okay"
        onClose={() => setNoticeOpen(false)}
        onConfirm={() => setNoticeOpen(false)}
      />

      <AppModal
        visible={errorOpen}
        icon="warning"
        title={errorInfo.title}
        message={errorInfo.message}
        cancelText={null}
        confirmText="Okay"
        onClose={() => setErrorOpen(false)}
        onConfirm={() => setErrorOpen(false)}
      />

      <BottomCard visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        {sheetMode === "create" ? (
          <>
            <SheetTitle
              title="New visitor pass"
              subtitle="Share the code with your visitor. Security enters it at the gate."
            />

            <AppTextField
              label="Visitor name"
              value={visitorName}
              onChangeText={setVisitorName}
              placeholder="e.g. Tunde Bello"
              autoCapitalize="words"
              error={
                formError && visitorName.trim().length < 2
                  ? formError
                  : undefined
              }
            />

            <Text style={styles.formLabel}>Valid for</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => {
                const on = duration === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => setDuration(d.key)}
                    style={[
                      styles.durationChip,
                      on && styles.durationChipOn,
                      { flexBasis: "31%", minWidth: 96 },
                    ]}
                  >
                    <Text
                      style={[styles.durationText, on && styles.durationTextOn]}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut,
                  );
                  setDuration("custom");
                }}
                style={({ pressed }) => [
                  styles.durationChip,
                  duration === "custom" && styles.durationChipOn,
                  { flexBasis: "31%", minWidth: 96 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text
                  style={[
                    styles.durationText,
                    duration === "custom" && styles.durationTextOn,
                  ]}
                >
                  Custom
                </Text>
              </Pressable>
            </View>

            {duration === "custom" && (
              <View style={styles.customPanel}>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => bumpCustom(-1)}
                    disabled={customAmount <= 1}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      customAmount <= 1 && { opacity: 0.35 },
                      pressed && { transform: [{ scale: 0.92 }] },
                    ]}
                  >
                    <Ionicons name="remove" size={20} color={colors.primary} />
                  </Pressable>

                  <View style={styles.stepValueWrap}>
                    <Text style={styles.stepValue}>{customAmount}</Text>
                    <Text style={styles.stepUnit}>
                      {customUnit === "hours"
                        ? customAmount === 1
                          ? "hour"
                          : "hours"
                        : customAmount === 1
                          ? "day"
                          : "days"}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => bumpCustom(1)}
                    disabled={customAmount >= maxFor(customUnit)}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      customAmount >= maxFor(customUnit) && { opacity: 0.35 },
                      pressed && { transform: [{ scale: 0.92 }] },
                    ]}
                  >
                    <Ionicons name="add" size={20} color={colors.primary} />
                  </Pressable>
                </View>

                <View style={styles.unitToggle}>
                  {(["hours", "days"] as const).map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => switchUnit(u)}
                      style={[
                        styles.unitOption,
                        customUnit === u && styles.unitOptionOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.unitText,
                          customUnit === u && styles.unitTextOn,
                        ]}
                      >
                        {u === "hours" ? "Hours" : "Days"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.expiryText}>
                  Expires {validLabel(now + customHours * 3600 * 1000)}
                </Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.textMuted}
              />
              <Text style={styles.infoText}>
                One-time pass. It works for a single entry.
              </Text>
            </View>

            {!!formError && visitorName.trim().length >= 2 && (
              <Text style={styles.formError}>{formError}</Text>
            )}

            <PrimaryButton
              title="Create pass"
              onPress={createPass}
              loading={creating}
            />
          </>
        ) : sheetMode === "history" ? (
          <>
            <SheetTitle
              title="Pass history"
              subtitle={
                history.length
                  ? `${history.length} past ${history.length === 1 ? "pass" : "passes"}. Tap one to see its code.`
                  : "Used, expired and cancelled passes are kept here."
              }
            />

            {history.length === 0 ? (
              <View style={styles.histEmpty}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="time-outline"
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>No past passes yet</Text>
                <Text style={styles.emptySub}>
                  Once a pass is used, expires or is cancelled, it shows up
                  here.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.histChips}>
                  {HISTORY_FILTERS.map((f) => {
                    const on = historyFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => setHistoryFilter(f.key)}
                        style={[styles.histChip, on && styles.histChipOn]}
                      >
                        <Text
                          style={[
                            styles.histChipText,
                            on && styles.histChipTextOn,
                          ]}
                        >
                          {f.label} {historyCounts[f.key]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {historyGroups.length === 0 ? (
                  <Text style={styles.histNone}>
                    No {historyFilter} passes.
                  </Text>
                ) : (
                  <ScrollView
                    style={{ maxHeight: Math.min(430, screenH * 0.5) }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {historyGroups.map((g) => (
                      <View key={g.label}>
                        <Text style={styles.histGroup}>{g.label}</Text>
                        {g.items.map((p) => (
                          <HistoryRow
                            key={p.id}
                            pass={p}
                            status={effStatus(p, now)}
                            now={now}
                            onPress={() => openPass(p, true)}
                          />
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </>
        ) : (
          livePass && (
            <>
              {fromHistory && (
                <Pressable
                  onPress={() => setSheetMode("history")}
                  hitSlop={10}
                  style={styles.backLink}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.backLinkText}>History</Text>
                </Pressable>
              )}
              <SheetTitle
                title={livePass.visitorName}
                subtitle={statusLine(livePass, now)}
              />

              {/* QR code for security scanning (also keep the digits visible) */}
              <View style={{ alignItems: "center", marginVertical: 5 }}>
                <QRCode
                  value={`nestly:visitor:${livePass.code}`}
                  size={APP_QR_SIZE}
                  quietZone={10}
                  backgroundColor="#FFFFFF"
                  color="#0F0A2E"
                  getRef={(c) => (qrRef.current = c)}
                />
              </View>

              <CodeBoxes key={livePass.id} code={livePass.code} />

              {liveStatus === "active" ? (
                <>
                  <Text style={styles.codeHint}>
                    Give this code to your visitor. Security enters it at the
                    gate.
                  </Text>
                  <View style={styles.sheetActions}>
                    <Pressable
                      onPress={askCancel}
                      style={({ pressed }) => [
                        styles.cancelBtn,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Ionicons name="close" size={18} color={colors.danger} />
                      <Text style={styles.cancelText}>Cancel pass</Text>
                    </Pressable>

                    <Pressable
                      onPress={shareQr}
                      style={({ pressed }) => [
                        styles.shareWrap,
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <LinearGradient
                        colors={["#7C5CFF", "#5B3CF0"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.shareBtn}
                      >
                        <Ionicons
                          name="share-social-outline"
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.shareText}>Share QR</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => sharePass(livePass)}
                    style={styles.shareAltLink}
                  >
                    <Text style={styles.shareAltText}>Send digits instead</Text>
                  </Pressable>
                </>
              ) : (
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: STATUS_TAG[liveStatus].bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: STATUS_TAG[liveStatus].fg },
                    ]}
                  >
                    {STATUS_TAG[liveStatus].label}
                  </Text>
                </View>
              )}
            </>
          )
        )}
      </BottomCard>

      {/* ---------- Fixed stage (map only, never scrolls) ---------- */}
      <View
        style={[styles.stage, styles.stageFixed, { height: stageH }]}
        pointerEvents="none"
      >
        {mapUri ? (
          <Image
            source={{ uri: mapUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() =>
              console.warn("[map] The map image failed to load. Check the API key.")
            }
          />
        ) : (
          <LinearGradient
            colors={["#C7B6FF", "#E6DDFF"]}
            style={StyleSheet.absoluteFill}
          >
            <View
              style={[
                styles.road,
                { top: 78, left: -40, transform: [{ rotate: "-12deg" }] },
              ]}
            />
            <View
              style={[
                styles.road,
                { top: 132, left: -30, width: 520, transform: [{ rotate: "7deg" }] },
              ]}
            />
            <View
              style={[styles.roadV, { left: 92, transform: [{ rotate: "12deg" }] }]}
            />
            <View
              style={[styles.roadV, { left: 262, transform: [{ rotate: "-9deg" }] }]}
            />
            <View
              style={[styles.park, { top: 46, right: 20, width: 96, height: 62 }]}
            />
            <View
              style={[styles.park, { top: 118, left: 22, width: 72, height: 50 }]}
            />
          </LinearGradient>
        )}

        {/* soft fade so the header stays readable on top of the map */}
        <View pointerEvents="none" style={styles.stageFade}>
          <LinearGradient
            colors={["rgba(205,189,255,0.9)", "rgba(205,189,255,0)"]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* pin sits exactly on the map centre, which is the estate location */}
        {!!mapUri && (
          <View
            pointerEvents="none"
            style={[styles.pinWrap, { top: stageH / 2 - 54 }]}
          >
            <View style={styles.pinHead}>
              <LinearGradient
                colors={["#8B6BFF", "#4B2FCC"]}
                style={styles.pinCore}
              >
                <Ionicons name="business" size={19} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <View style={styles.pinTip} />
            <View style={styles.pinDot} />
          </View>
        )}

      </View>

      {/* ---------- Scrolling content ---------- */}
      <Animated.ScrollView
        style={StyleSheet.absoluteFill}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const hide = e.nativeEvent.contentOffset.y > 60;
              setHeaderHidden((prev) => (prev === hide ? prev : hide));
            },
          },
        )}
      >
        {/* transparent spacer so the sheet starts below the map */}
        <View style={{ height: stageH }} pointerEvents="none" />

        {/* ---------- White sheet ---------- */}
        <View
          style={[
            styles.sheet,
            {
              minHeight: screenH - stageH + SHEET_LIFT,
              paddingBottom: insets.bottom + 160,
            },
          ]}
        >
          {/* banner */}
          <LinearGradient
            colors={["#7A5CFF", "#4B2FCC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View style={styles.bannerCircleA} />
            <View style={styles.bannerCircleB} />
            <Ionicons
              name="business"
              size={150}
              color="rgba(255,255,255,0.1)"
              style={styles.bannerArt}
            />

            <View style={styles.bannerTop}>
              <View style={styles.rolePill}>
                <Ionicons name="home" size={14} color={colors.primary} />
                <Text style={styles.rolePillText}>
                  {profile?.unit ? `Unit ${profile.unit}` : "Resident"}
                </Text>
              </View>
            </View>

            <View>
              <Text style={styles.bannerKicker} numberOfLines={1}>
                {(estate?.address || "Your estate").toUpperCase()}
              </Text>
              <Text style={styles.bannerName} numberOfLines={2}>
                {estate?.name ?? "Loading..."}
              </Text>
            </View>
          </LinearGradient>

          {/* address and maps */}
          {!!estate?.address && (
            <View style={styles.addressRow}>
              <Ionicons
                name="location-outline"
                size={16}
                color={colors.textMuted}
              />
              <Text style={styles.addressText} numberOfLines={1}>
                {estate.address}
              </Text>
              <Pressable
                onPress={openMaps}
                style={({ pressed }) => [styles.mapsBtn, pressed && { opacity: 0.8 }]}
                hitSlop={6}
              >
                <Ionicons name="navigate-outline" size={13} color={colors.primary} />
                <Text style={styles.mapsText}>Open in Maps</Text>
              </Pressable>
            </View>
          )}

          {/* chips */}
          <View style={styles.chipRow}>
            <Chip
              icon="qr-code-outline"
              label={`${activePasses} active`}
              tint={colors.primary}
              bg="#F1EBFF"
            />
            <Chip
              icon="people-outline"
              label={`${visitorsToday} today`}
              tint="#55556A"
              bg="#F3F2F7"
            />
            <Chip
              icon="calendar-outline"
              label={today}
              tint="#55556A"
              bg="#F3F2F7"
            />
            {pendingSync > 0 && (
              <Chip
                icon="cloud-upload-outline"
                label={`${pendingSync} pending sync`}
                tint="#5B3CF0"
                bg="#F1EBFF"
              />
            )}
          </View>

          {!!pendingSync && (
            <View style={styles.syncNote}>
              <Ionicons name="cloud-upload-outline" size={14} color={colors.primary} />
              <Text style={styles.syncNoteText}>Queued to sync when your connection is back.</Text>
            </View>
          )}

          {/* passes */}
          <View style={{ height: 22 }} />
          <SectionHeader title="Your passes" />

          {passesError ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={24}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>Could not load your passes</Text>
              <Text style={styles.emptySub}>
                Check your connection and try again.
              </Text>
              {__DEV__ && <Text style={styles.devHint}>{passesError}</Text>}
            </View>
          ) : active.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="qr-code-outline"
                  size={24}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>No active passes</Text>
              <Text style={styles.emptySub}>
                Create a pass when someone is coming to visit.
              </Text>
              <Pressable onPress={openCreate} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Create pass</Text>
              </Pressable>
            </View>
          ) : (
            active.map((p) => (
              <PassRow
                key={p.id}
                pass={p}
                status="active"
                onPress={() => openPass(p)}
              />
            ))
          )}

          {past.length > 0 && (
            <>
              <View style={styles.earlierRow}>
                <Text style={styles.earlier}>Earlier</Text>
                {history.length > past.length && (
                  <Pressable onPress={openHistory} hitSlop={10}>
                    <Text style={styles.earlierLink}>
                      See all {history.length}
                    </Text>
                  </Pressable>
                )}
              </View>
              {past.map((p) => (
                <PassRow
                  key={p.id}
                  pass={p}
                  status={effStatus(p, now)}
                  onPress={() => openPass(p)}
                />
              ))}
            </>
          )}
        </View>
      </Animated.ScrollView>

      <Animated.View
        style={[
          styles.headerBar,
          styles.headerFixed,
          {
            paddingTop: insets.top + 11,
            opacity: headerOpacity,
            transform: [{ translateY: headerShift }],
          },
        ]}
        pointerEvents={headerHidden ? "none" : "box-none"}
      >
        <ProfileAvatar online fallback="Resident" />

        <View style={styles.pillWrap} pointerEvents="none">
          <View style={styles.estatePill}>
            <Ionicons name="business" size={14} color={colors.primary} />
            <Text style={styles.estatePillText} numberOfLines={1}>
              {estate?.name ?? "Loading..."}
            </Text>
          </View>
        </View>

        <View style={styles.iconGroup}>
          <Pressable
            onPress={() => router.push("/(resident)/settings" as any)}
            hitSlop={8}
            accessibilityLabel="Open settings"
            style={({ pressed }) => [styles.roundBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="settings-outline" size={19} color="#757577" />
          </Pressable>
        </View>
      </Animated.View>

      {/* ---------- Floating nav ---------- */}
      <Pressable
        onPress={openCreate}
        accessibilityLabel="Create visitor pass"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 12 + BAR_HEIGHT + 12 },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <LinearGradient
          colors={["#7C5CFF", "#5B3CF0"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>

    </View>
  );
}

/* --------------------------------- Styles --------------------------------- */

const styles = StyleSheet.create({
  /* stage */
  stage: { overflow: "hidden", backgroundColor: "#C7B6FF" },
  stageFixed: { position: "absolute", top: 0, left: 0, right: 0 },
  stageFade: { position: "absolute", top: 0, left: 0, right: 0, height: 100 },
  pinWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pinHead: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4B2FCC",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pinCore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  pinTip: {
    width: 12,
    height: 12,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    marginTop: -7,
  },
  pinDot: {
    position: "absolute",
    bottom: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(91,60,240,0.28)",
    zIndex: -1,
  },
  road: {
    position: "absolute",
    width: 460,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  roadV: {
    position: "absolute",
    top: -40,
    width: 12,
    height: 280,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  park: {
    position: "absolute",
    borderRadius: 18,
    backgroundColor: "rgba(94,214,170,0.32)",
  },

  /* header */
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 17,
  },
  headerFixed: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  pillWrap: { flex: 1, alignItems: "center" },
  estatePill: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.49)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  estatePillText: {
    flexShrink: 1,
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: "#0F0A2E",
  },
  iconGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },

  /* sheet */
  sheet: {
    marginTop: -SHEET_LIFT,
    paddingTop: 18,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    zIndex: 30,
    elevation: 30,
  },

  /* banner */
  banner: {
    height: 188,
    borderRadius: 28,
    padding: 16,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  bannerCircleA: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(255,255,255,0.09)",
    top: -70,
    right: -50,
  },
  bannerCircleB: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.07)",
    bottom: -40,
    left: -30,
  },
  bannerArt: { position: "absolute", right: -14, bottom: -16 },
  bannerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  rolePillText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12,
    color: "#0F0A2E",
  },
  bannerKicker: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 11,
    letterSpacing: 1.1,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 4,
  },
  bannerName: {
    fontFamily: "PlusJakartaSans_800ExtraBold",
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.6,
    color: "#FFFFFF",
    maxWidth: "82%",
  },

  /* address, chips */
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  addressText: {
    flex: 1,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 13,
    color: colors.textMuted,
  },
  mapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#F1EBFF",
  },
  mapsText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12,
    color: colors.primary,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  syncNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F1EBFF",
  },
  syncNoteText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12,
    color: colors.primary,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  chipText: { fontFamily: "PlusJakartaSans_700Bold", fontSize: 12.5 },

  /* sections */
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { ...typography.caption, color: colors.textMuted },
  earlier: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
    marginBottom: 10,
  },
  earlierRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earlierLink: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: colors.primary,
    marginTop: 10,
    marginBottom: 10,
  },

  /* Pass rows */
  passRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: "#F6F4FB",
  },
  passIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  passName: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 15.5,
    color: colors.text,
  },
  passMeta: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 0,
  },
  codePill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  codePillText: {
    fontFamily: "PlusJakartaSans_800ExtraBold",
    fontSize: 13.5,
    letterSpacing: 1,
    color: colors.primary,
  },
  tag: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  tagText: { fontFamily: "PlusJakartaSans_700Bold", fontSize: 11.5 },

  /* Empty */
  emptyCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 24,
    marginBottom: 10,
    // backgroundColor: "#F6F4FB",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    fontFamily: "PlusJakartaSans_800ExtraBold",
    color: colors.text,
  },
  emptySub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 3,
    textAlign: "center",
    maxWidth: 220,
  },
  emptyBtn: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 22,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: {
    ...typography.caption,
    fontFamily: "PlusJakartaSans_700Bold",
    color: colors.primary,
  },
  devHint: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 11,
    color: "#A32D2D",
    marginTop: 10,
  },

  /* History sheet */
  histChips: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  histChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "rgba(108,71,255,0.14)",
  },
  histChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  histChipText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12.5,
    color: colors.text,
  },
  histChipTextOn: { color: "#FFFFFF" },
  histGroup: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.textMuted,
    marginTop: 14,
    marginBottom: 6,
  },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(108,71,255,0.08)",
  },
  histName: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 14.5,
    color: colors.text,
  },
  histMeta: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  histCode: {
    fontFamily: "PlusJakartaSans_800ExtraBold",
    letterSpacing: 0.8,
    color: colors.primary,
  },
  histNone: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 28,
  },
  histEmpty: { alignItems: "center", paddingVertical: 24 },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    marginBottom: 6,
  },
  backLinkText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: colors.primary,
  },

  /* Create sheet */
  formLabel: {
    fontFamily: "PlusJakartaSans_800ExtraBold",
    fontSize: 13,
    color: colors.text,
    marginTop: 6,
    marginBottom: 10,
  },
  durationRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  durationChip: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "rgba(108,71,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: colors.text,
    textAlign: "center",
  },
  durationTextOn: { color: "#FFFFFF" },
  customPanel: {
    backgroundColor: "#f3f3f3",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    gap: 12,
    shadowColor: "#808080",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(108,71,255,0.14)",
  },
  stepValueWrap: { alignItems: "center", minWidth: 90 },
  stepValue: {
    fontFamily: "PlusJakartaSans_800ExtraBold",
    fontSize: 30,
    lineHeight: 34,
    color: "#0F0A2E",
  },
  stepUnit: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 12,
    color: colors.textMuted,
  },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    padding: 3,
  },
  unitOption: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  unitOptionOn: { backgroundColor: colors.primary },
  unitText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: colors.text,
  },
  unitTextOn: { color: "#FFFFFF" },
  expiryText: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  infoText: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12.5,
    color: colors.textMuted,
  },
  formError: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    color: "#A32D2D",
    textAlign: "center",
    marginBottom: 12,
  },

  /* View sheet */
  boxesRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  box: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F0FF",
    borderWidth: 1.5,
    borderColor: "#CDBFFF",
  },
  boxText: { fontFamily: "PlusJakartaSans_800ExtraBold", color: "#0F0A2E" },
  codeHint: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  sheetActions: { flexDirection: "row", gap: 10, marginBottom: 6 },
  cancelBtn: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    gap: 6,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "rgba(220,38,38,0.25)",
  },
  cancelText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 14.5,
    color: colors.danger,
  },
  shareWrap: {
    flex: 1.3,
    borderRadius: radius.full,
    shadowColor: "#5B3CF0",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  shareBtn: {
    height: 52,
    flexDirection: "row",
    gap: 6,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  shareText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 14.5,
    color: "#FFFFFF",
  },
  shareAltLink: { alignSelf: "center", marginTop: 10, marginBottom: 2 },
  shareAltText: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12.5,
    color: colors.primary,
  },
  statusPill: {
    alignSelf: "center",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  statusPillText: { fontFamily: "PlusJakartaSans_800ExtraBold", fontSize: 13 },

  /* Floating nav */
  navWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 10,
    elevation: 10,
  },
  navBar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: NAV_BORDER,
    borderColor: "rgba(91,60,240,0.08)",
    shadowColor: "#4B2FCC",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  navInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: NAV_PAD,
  },
  pillGlow: {
    position: "absolute",
    left: 0,
    top: (BAR_HEIGHT - NAV_BORDER * 2 - PILL_HEIGHT) / 2,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: "#6A4BFF",
    shadowColor: "#7C5CFF",
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pillClip: {
    flex: 1,
    borderRadius: PILL_HEIGHT / 2,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
  },
  pillShine: { position: "absolute", top: 0, left: 0, right: 0, height: "55%" },
  navItem: { flex: 1, height: 62, alignItems: "center", justifyContent: "center" },
  iconBox: { width: 26, height: 26 },
  labelBox: { width: "100%", height: 14, marginTop: 3 },
  navLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 10.5,
  },
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  /* New-pass button floating above the nav */
  fab: {
    position: "absolute",
    right: 20,
    zIndex: 40,
    borderRadius: 28,
    shadowColor: "#5B3CF0",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 40,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
});