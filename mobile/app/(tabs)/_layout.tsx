import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} size={24} color={color} style={{ marginBottom: -3 }} />;
}

export default function TabLayout() {
  const colors = Colors[useColorScheme()];
  const { user } = useAuth();

  // The root index route already gates on auth before sending anyone here, but a
  // deep link (or the refresh token expiring mid-session) can land here directly.
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        header: () => <AppHeader />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon name="home" color={color as string} /> }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: 'My Trips', tabBarIcon: ({ color }) => <TabIcon name="airplane" color={color as string} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explore', tabBarIcon: ({ color }) => <TabIcon name="compass" color={color as string} /> }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: 'Feed', tabBarIcon: ({ color }) => <TabIcon name="chatbubbles" color={color as string} /> }}
      />
      <Tabs.Screen
        name="rewards"
        options={{ title: 'Rewards', tabBarIcon: ({ color }) => <TabIcon name="trophy" color={color as string} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon name="person-circle" color={color as string} />,
        }}
      />
    </Tabs>
  );
}
