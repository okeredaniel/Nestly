import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { router } from 'expo-router';
import { auth, db } from '@/lib/firebase';
import { HOME_ROUTE } from '@/lib/roles';
import AppModal from '@/components/ui/AppModal';
import NestlyLoader from '@/components/ui/NestlyLoader';
import SimpleLoader from '@/components/ui/SimpleLoader';

export type Role = 'admin' | 'resident' | 'security' | 'facility';

export type Profile = {
  name: string;
  email: string;
  estateId: string | null;
  role: Role | null;
  status?: 'pending' | 'approved' | 'rejected' | null;
  unit?: string;
  photoURL?: string | null;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  triggerSplash: () => void;
};

let suppressRoleNotice = false;

export const setSuppressRoleNotice = (next: boolean) => {
  suppressRoleNotice = next;
};

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  triggerSplash: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [roleMoveNotice, setRoleMoveNotice] = useState<{ from: Role | null; to: Role | null } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const previousRoleRef = useRef<Role | null>(null);
  const signingOutRef = useRef(false);

  const triggerSplash = () => {
    // The branded Nestly loader is reserved for the first app-open boot, not for
    // standard login/signup transitions.
    if (loaderVisible) return;
  };

  const signOut = async () => {
    signingOutRef.current = true;
    setSigningOut(true);
    setLoading(true);

    try {
      await firebaseSignOut(auth);
      setProfile(null);
      setUser(null);
    } catch (error) {
      console.warn('Sign out failed:', error);
      setProfile(null);
      setUser(null);
    } finally {
      setLoading(false);
      setTimeout(() => {
        setSigningOut(false);
        signingOutRef.current = false;
        try {
          router.replace('/welcome' as any);
        } catch {
          // no-op: guard against navigation races during auth teardown
        }
      }, 3000);
    }
  };

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u: any) => {
      unsubProfile?.();
      unsubProfile = undefined;
      previousRoleRef.current = null;
      setRoleMoveNotice(null);
      setUser(u);
      setLoading(true);

      if (!u) {
        setProfile(null);
        setUser(null);
        setLoading(false);
        if (signingOutRef.current || !previousRoleRef.current) {
          setTimeout(() => {
            try {
              router.replace('/welcome' as any);
            } catch {
              // no-op: guard against navigation races during auth teardown
            }
          }, 50);
        }
        return;
      }

      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (snap: any) => {
          const nextProfile = snap.exists() ? (snap.data() as Profile) : null;
          const nextRole = nextProfile?.role ?? null;

          if (!suppressRoleNotice && previousRoleRef.current && previousRoleRef.current !== nextRole && nextRole) {
            setRoleMoveNotice({
              from: previousRoleRef.current,
              to: nextRole,
            });
          }

          previousRoleRef.current = nextRole;
          setProfile(nextProfile);
          setLoading(false);
        },
        () => setLoading(false),
      );
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, profile, loading, signOut, triggerSplash }),
    [user, profile, loading, signOut],
  );

  const roleLabel = (role: Role | null) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'resident':
        return 'Resident';
      case 'security':
        return 'Security';
      case 'facility':
        return 'Facility';
      default:
        return 'Resident';
    }
  };

  const handleRoleMoveConfirm = () => {
    const nextRole = roleMoveNotice?.to ?? 'resident';
    setRoleMoveNotice(null);
    router.replace(HOME_ROUTE[nextRole] as any);
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {signingOut && <SimpleLoader label="Logging out..." />}
      <NestlyLoader visible={loaderVisible} onFinished={() => setLoaderVisible(false)} />
      <AppModal
        visible={!!roleMoveNotice}
        icon="people"
        title="Role updated"
        message={
          roleMoveNotice
            ? `You have been moved from ${roleLabel(roleMoveNotice.from)} to ${roleLabel(roleMoveNotice.to)}.`
            : ''
        }
        cancelText={null}
        confirmText="I understand"
        onClose={handleRoleMoveConfirm}
        onConfirm={handleRoleMoveConfirm}
      />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
