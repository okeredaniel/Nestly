import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import AppModal from '@/components/ui/AppModal';
import AppTextField from '@/components/ui/AppTextField';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { auth, db } from '@/lib/firebase';
import { colors, spacing, typography } from '@/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const friendlyError = (code?: string) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists';
    case 'auth/weak-password':
      return 'Use a stronger password';
    case 'auth/invalid-email':
      return 'Enter a valid email address';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet';
    default:
      return 'Something went wrong. Try again';
  }
};

type Mode = 'login' | 'signup';
type Errors = { name?: string; email?: string; password?: string; confirm?: string };

export default function AuthCard() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>(modeParam === 'login' ? 'login' : 'signup');
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const anim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [anim]);

  const isLogin = mode === 'login';

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome' as any);
  };

  const showSoon = (feature: string) => {
    setNotice({ title: 'Coming soon', message: `${feature} is coming soon.` });
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep(1);
    setErrors({});
    setPassword('');
    setConfirm('');
  };

  const submitLogin = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/' as any);
    } catch (err: any) {
      setErrors({ password: friendlyError(err?.code) });
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async () => {
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await setDoc(
        doc(db, 'users', cred.user.uid),
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          estateId: null,
          role: null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      router.replace('/' as any);
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        setStep(1);
        setErrors({ email: friendlyError(err.code) });
      } else {
        setErrors({ password: friendlyError(err?.code) });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!EMAIL_REGEX.test(email.trim())) {
      setErrors({ email: 'Enter your email first' });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      showSoon('Reset link sent. Check your email');
    } catch (err: any) {
      showSoon(friendlyError(err?.code));
    }
  };

  const handleSubmit = () => {
    const e: Errors = {};

    if (isLogin) {
      if (step === 1) {
        if (!EMAIL_REGEX.test(email.trim())) e.email = 'Enter a valid email address';
        setErrors(e);
        if (Object.keys(e).length === 0) setStep(2);
        return;
      }

      if (!password) e.password = 'Enter your password';
      setErrors(e);
      if (Object.keys(e).length === 0) submitLogin();
      return;
    }

    if (step === 1) {
      if (!EMAIL_REGEX.test(email.trim())) e.email = 'Enter a valid email address';
      setErrors(e);
      if (Object.keys(e).length === 0) setStep(2);
      return;
    }

    if (name.trim().length < 2) e.name = 'Enter your full name';
    if (password.length < 8) e.password = 'Use at least 8 characters';
    if (confirm !== password) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length === 0) submitSignup();
  };

  const title = isLogin
    ? step === 1
      ? 'Welcome back'
      : 'Enter your password'
    : step === 1
      ? 'Create an account'
      : 'Almost there';
  const buttonTitle = isLogin ? (step === 1 ? 'Continue' : 'Log in') : step === 1 ? 'Continue' : 'Create account';

  const cardAnim = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }) }],
  };

  return (
    <Pressable style={styles.backdrop} onPress={close}>
      <AppModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message}
        cancelText={null}
        onClose={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
        confirmText="OK"
      />

      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.center, { paddingBottom: insets.bottom + 12 }]}
      >
        <Animated.View style={cardAnim}>
          <Pressable style={[styles.card, { maxHeight: height * 0.88 }]} onPress={() => {}}>
            <Pressable onPress={close} hitSlop={10} style={styles.handleWrap}>
              <View style={styles.handle} />
            </Pressable>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.title}>{title}</Text>

              {!isLogin && step === 2 && (
                <Pressable onPress={() => setStep(1)} style={styles.emailRow} hitSlop={8}>
                  <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.emailRowText} numberOfLines={1}>{email.trim()}</Text>
                  <Text style={styles.emailRowChange}>Change</Text>
                </Pressable>
              )}

              {(isLogin ? step === 1 : step === 1) && (
                <AppTextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.email}
                />
              )}

              {!isLogin && step === 2 && (
                <AppTextField
                  label="Full name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Your full name"
                  autoCapitalize="words"
                  error={errors.name}
                />
              )}

              {((isLogin && step === 2) || (!isLogin && step === 2)) && (
                <AppTextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                  secureTextEntry
                  autoCapitalize="none"
                  error={errors.password}
                />
              )}

              {!isLogin && step === 2 && (
                <AppTextField
                  label="Confirm password"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repeat your password"
                  secureTextEntry
                  autoCapitalize="none"
                  error={errors.confirm}
                />
              )}

              {isLogin && step === 2 && (
                <Pressable onPress={handleForgot} style={styles.forgot} hitSlop={8}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
              )}

              <PrimaryButton title={buttonTitle} onPress={handleSubmit} loading={loading} />

              <Pressable
                onPress={() => switchMode(isLogin ? 'signup' : 'login')}
                style={styles.switch}
                hitSlop={8}
              >
                <Text style={styles.switchText}>
                  {isLogin ? 'New to Nestly? ' : 'Already have an account? '}
                  <Text style={styles.switchBold}>{isLogin ? 'Create an account' : 'Log in'}</Text>
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)' },
  center: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D8D6DE',
  },
  content: { padding: 24, paddingTop: 8, paddingBottom: 32 },
  title: { ...typography.h1,
  fontFamily: "PlusJakartaSans_800ExtraBold",
  fontSize: 25,
  lineHeight: 44,
  letterSpacing: 0,
  color: "#0F0A2E",
  textAlign: "center",
  textShadowColor: "#0F0A2E",
  textShadowOffset: { width: 0.5, height: 0 },
  textShadowRadius: 0.8,
  marginBottom: 11
},

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.textMuted, marginHorizontal: 12 },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  emailRowText: { flex: 1, ...typography.caption, color: colors.text },
  emailRowChange: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: spacing.lg },
  forgotText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  switch: { alignItems: 'center', marginTop: spacing.lg },
  switchText: { ...typography.caption, color: colors.textMuted },
  switchBold: { color: colors.primary, fontWeight: '900' },
});
