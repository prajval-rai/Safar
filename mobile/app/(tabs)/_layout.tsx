import { Redirect, Tabs } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { useAuth } from '@/lib/auth';

/** Just two tabs: your trips, and you. Everything about a trip lives on its
 *  own page (plan, chat, photos, money, checklist, people). */
export default function TabLayout() {
  const { user } = useAuth();

  // The root index route already gates on auth before sending anyone here, but a
  // deep link (or the refresh token expiring mid-session) can land here directly.
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        header: () => <AppHeader />,
        // Keep each tab mounted once visited, so switching back is instant.
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'My trips' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
