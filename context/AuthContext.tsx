import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { router } from 'expo-router';
import { auth, db } from '@/lib/firebase';
import { HOME_ROUTE } from '@/lib/roles';
import AppModal from '@/components/ui/AppModal';

export type Role = 'admin' | 'resident' | 'security' | 'facility';

export type Profile = {
  name: string;
  email: string;
  estateId: string | null;
  role: Role | null;
  status?: 'pending' | 'approved' | 'rejected' | null;
  unit?: string;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleMoveNotice, setRoleMoveNotice] = useState<{ from: Role | null; to: Role | null } | null>(null);
  const previousRoleRef = useRef<Role | null>(null);

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
        setLoading(false);
        return;
      }

      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (snap: any) => {
          const nextProfile = snap.exists() ? (snap.data() as Profile) : null;
          const nextRole = nextProfile?.role ?? null;

          if (previousRoleRef.current && previousRoleRef.current !== nextRole && nextRole) {
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
    () => ({ user, profile, loading, signOut: () => firebaseSignOut(auth) }),
    [user, profile, loading],
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
