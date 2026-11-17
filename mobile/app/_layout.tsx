import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { mobileSupabase } from '../src/client';

/**
 * Navigation is a UX guard. Founder authorization is always rechecked by
 * requireFounder on the FCR API, including the server-held allowlist.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = mobileSupabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active || event === 'INITIAL_SESSION') return;
      setSession(nextSession);
    });

    // getSession alone trusts local storage; validate the restored user first.
    void (async () => {
      try {
        const { data: userData, error: userError } = await mobileSupabase.auth.getUser();
        if (userError || !userData.user) {
          if (active) setSession(null);
          return;
        }
        const { data: sessionData, error: sessionError } = await mobileSupabase.auth.getSession();
        if (active) setSession(sessionError ? null : sessionData.session);
      } catch {
        if (active) setSession(null);
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#60a5fa" accessibilityLabel="Verifying founder session" />
      </View>
    );
  }

  const screenOptions = {
    headerStyle: { backgroundColor: '#07111f' },
    headerTintColor: '#f8fafc',
    contentStyle: { backgroundColor: '#030712' },
  };

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" options={{ title: 'Founder Sign In' }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="dashboard" options={{ title: 'Founder Control Room' }} />
      </Stack.Protected>
    </Stack>
  );
}
