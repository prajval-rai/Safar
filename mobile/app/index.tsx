import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { View } from '@/components/Themed';
import { useAuth } from '@/lib/auth';

/** The very first route. Waits for the stored session check, then sends the
 *  traveller to their trips or to the login screen. */
export default function Index() {
  const { user } = useAuth();

  if (user === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
