import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { mobileSupabase, verifyFounderAccess } from '../src/client';

/**
 * A Supabase session is authentication, not founder authorization.
 * The dashboard stays hidden until FCR's existing requireFounder API gate
 * verifies BOTH the token and the server-side founder_users identity binding.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [verificationIssue, setVerificationIssue] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let verificationId = 0;

    const verify = async () => {
      const id = ++verificationId;
      setSession(undefined);
      setVerificationIssue(null);
      try {
        const { data: sessionData, error: sessionError } = await mobileSupabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          if (active && id === verificationId) setSession(null);
          return;
        }

        // Never authorize from getSession() or editable user metadata alone.
        const { data: userData, error: userError } = await mobileSupabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          await mobileSupabase.auth.signOut({ scope: 'local' }).catch(() => {});
          if (active && id === verificationId) setSession(null);
          return;
        }

        await verifyFounderAccess();
        if (active && id === verificationId) setSession(sessionData.session);
      } catch {
        if (active && id === verificationId) {
          setSession(null);
          setVerificationIssue('Founder access could not be verified. The dashboard remains locked.');
        }
      }
    };

    const { data: { subscription } } = mobileSupabase.auth.onAuthStateChange((event) => {
      if (!active || event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        verificationId += 1;
        setSession(null);
        setVerificationIssue(null);
        return;
      }
      // Do not await another Supabase auth call inside the auth-state callback.
      void Promise.resolve().then(verify);
    });

    void verify();
    return () => {
      active = false;
      verificationId += 1;
      subscription.unsubscribe();
    };
  }, [attempt]);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#60a5fa" accessibilityLabel="Verifying founder access" />
      </View>
    );
  }

  if (verificationIssue) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text style={{ color: '#f8fafc', fontSize: 22, fontWeight: '700' }}>Founder access locked</Text>
        <Text style={{ color: '#cbd5e1', fontSize: 15 }}>{verificationIssue}</Text>
        <Pressable accessibilityRole="button" onPress={() => setAttempt((count) => count + 1)}>
          <Text style={{ color: '#93c5fd', fontSize: 16 }}>Retry verification</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void mobileSupabase.auth.signOut({ scope: 'local' }).catch(() => {
              setVerificationIssue('Sign out was not completed. The dashboard remains locked.');
            });
          }}
        >
          <Text style={{ color: '#cbd5e1', fontSize: 16 }}>Sign out</Text>
        </Pressable>
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
