import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import SimpleLoader from '@/components/ui/SimpleLoader';
import { HOME_ROUTE } from '@/lib/roles';

export default function Index() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <SimpleLoader label="Loading..." />;
  }

  if (!user) return <Redirect href={'/welcome' as any} />;

  // Redirect to home route based on live role (require approved status and estate)
  if (profile?.estateId && profile?.status === 'approved' && profile.role) {
    const route = HOME_ROUTE[profile.role];
    return <Redirect href={route as any} />;
  }

  return <Redirect href={'/estate-choice' as any} />;
}
