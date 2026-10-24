import { useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import {
  currentFounderSession,
  loadActivity,
  loadCosts,
  loadProofEngine,
  loadTasks,
  signInFounder,
  signOutFounder,
  type DashboardActivity,
  type DashboardTask,
  type ProofSnapshot,
} from '../src/client';

type DashboardState = {
  tasks: DashboardTask[];
  activity: DashboardActivity[];
  totalUsd: number;
  byAgent: Array<{ agentName: string; costUsd: number }>;
};

const EMPTY_DASHBOARD: DashboardState = {
  tasks: [],
  activity: [],
  totalUsd: 0,
  byAgent: [],
};

export default function FounderControlRoomMobile() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState>(EMPTY_DASHBOARD);
  const [projectSlug, setProjectSlug] = useState('founder-control-room');
  const [proofProject, setProofProject] = useState<{ slug: string; name: string } | null>(null);
  const [proof, setProof] = useState<ProofSnapshot | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const restored = await currentFounderSession();
        setSession(restored);
        if (restored) await refreshDashboard(false);
      } catch (caught) {
        setError(messageFrom(caught));
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const proofState = useMemo(() => {
    if (!proof) return 'NOT LOADED';
    const candidate = proof.state ?? proof.status ?? proof.readiness;
    return typeof candidate === 'string' && candidate.trim()
      ? candidate.toUpperCase()
      : 'SNAPSHOT LOADED';
  }, [proof]);

  async function refreshDashboard(withFeedback = true) {
    setRefreshing(true);
    setError(null);
    try {
      const [tasksResult, activityResult, costsResult] = await Promise.all([
        loadTasks(),
        loadActivity(),
        loadCosts(),
      ]);
      setDashboard({
        tasks: tasksResult.tasks,
        activity: activityResult.activity,
        totalUsd: Number(costsResult.totalUsd ?? 0),
        byAgent: costsResult.byAgent,
      });
      if (withFeedback) await Haptics.selectionAsync();
    } catch (caught) {
      setError(messageFrom(caught));
      if (withFeedback) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setRefreshing(false);
    }
  }

  async function signIn() {
    if (!email.trim() || !password) {
      setError('Enter the founder email and password.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setError(null);
    try {
      const next = await signInFounder(email, password);
      setSession(next);
      setPassword('');
      await refreshDashboard(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(messageFrom(caught));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }

  async function signOut() {
    try {
      await signOutFounder();
    } finally {
      setSession(null);
      setDashboard(EMPTY_DASHBOARD);
      setProof(null);
      setProofProject(null);
      setError(null);
    }
  }

  async function loadProof() {
    setError(null);
    try {
      const result = await loadProofEngine(projectSlug);
      setProofProject(result.project);
      setProof(result.snapshot);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(messageFrom(caught));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }

  async function shareProof() {
    if (!proof || !proofProject) return;
    const summary = [
      'Founder Control Room proof snapshot',
      `Project: ${proofProject.name} (${proofProject.slug})`,
      `State: ${proofState}`,
      '',
      'Read-only mobile observation. This snapshot does not authorize approve, merge, deploy, publish, spend, or delete actions.',
    ].join('\n');
    await Haptics.selectionAsync();
    await Share.share({ title: 'FCR proof snapshot', message: summary });
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <Text style={styles.eyebrow}>FOUNDER CONTROL ROOM</Text>
          <Text style={styles.muted}>Restoring secure founder session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>NATIVE FOUNDER READ MODEL</Text>
            <Text style={styles.title}>Your control room, without cloning its authority.</Text>
            <Text style={styles.subtitle}>
              Sign in with the same Supabase identity FCR already verifies. Mobile v1 can observe the control plane but cannot manufacture interactive founder authority.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Founder email</Text>
            <TextInput
              accessibilityLabel="Founder email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="founder@example.com"
              placeholderTextColor="#64748b"
              style={styles.input}
              value={email}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Founder password"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => void signIn()} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Enter Control Room</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshDashboard()} tintColor="#60a5fa" />}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>FOUNDER MISSION CONTROL</Text>
            <Text style={styles.titleSmall}>Same truth. Pocket view.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.ghostButton}>
            <Text style={styles.ghostText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.metricRow}>
          <Metric label="Tasks" value={String(dashboard.tasks.length)} />
          <Metric label="Activity" value={String(dashboard.activity.length)} />
          <Metric label="Tracked cost" value={`$${dashboard.totalUsd.toFixed(2)}`} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Proof Engine</Text>
          <Text style={styles.muted}>Read an existing FCR proof snapshot. No proof refresh or execution is triggered here.</Text>
          <TextInput
            accessibilityLabel="Project slug"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setProjectSlug}
            placeholder="project slug"
            placeholderTextColor="#64748b"
            style={styles.input}
            value={projectSlug}
          />
          <Pressable accessibilityRole="button" onPress={() => void loadProof()} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Read proof state</Text>
          </Pressable>
          {proof ? (
            <View style={styles.proofBlock}>
              <Text style={styles.proofState}>{proofState}</Text>
              <Text style={styles.muted}>{proofProject?.name ?? projectSlug}</Text>
              <Pressable accessibilityRole="button" onPress={() => void shareProof()} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Share bounded snapshot</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Latest tasks</Text>
          {dashboard.tasks.slice(0, 6).map((task) => (
            <View key={task.id} style={styles.listItem}>
              <Text style={styles.itemTitle}>{task.title}</Text>
              <Text style={styles.muted}>{task.project?.name ?? 'Unlabeled project'} · {task.status}{task.risk_level ? ` · ${task.risk_level}` : ''}</Text>
            </View>
          ))}
          {dashboard.tasks.length === 0 ? <Text style={styles.muted}>No task rows returned.</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Latest activity</Text>
          {dashboard.activity.slice(0, 6).map((event) => (
            <View key={event.id} style={styles.listItem}>
              <Text style={styles.itemTitle}>{event.event_type}</Text>
              <Text style={styles.muted}>{event.project?.name ?? 'Unlabeled project'} · {event.severity}</Text>
            </View>
          ))}
          {dashboard.activity.length === 0 ? <Text style={styles.muted}>No activity rows returned.</Text> : null}
        </View>

        <View style={styles.boundaryCard}>
          <Text style={styles.boundaryTitle}>Authority boundary</Text>
          <Text style={styles.boundaryText}>
            Mobile v1 is read-only. It does not call manual analysis, approval mutation, merge, deploy, publish, spend, or delete surfaces. High-consequence decisions remain behind FCR's interactive founder capability.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function messageFrom(value: unknown): string {
  return value instanceof Error ? value.message : 'Founder Control Room request failed.';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#030712' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  hero: { gap: 8, paddingTop: 12 },
  eyebrow: { color: '#60a5fa', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#f8fafc', fontSize: 30, lineHeight: 36, fontWeight: '900' },
  titleSmall: { color: '#f8fafc', fontSize: 24, lineHeight: 30, fontWeight: '900' },
  subtitle: { color: '#94a3b8', fontSize: 15, lineHeight: 22 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  card: { backgroundColor: '#0f172a', borderColor: '#1e3a5f', borderRadius: 20, borderWidth: 1, gap: 12, padding: 18 },
  label: { color: '#cbd5e1', fontSize: 13, fontWeight: '800' },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#334155', backgroundColor: '#07111f', color: '#f8fafc', paddingHorizontal: 14, fontSize: 15 },
  primaryButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  primaryText: { color: '#ffffff', fontWeight: '900', fontSize: 14 },
  secondaryButton: { alignItems: 'center', borderColor: '#3b82f6', borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14 },
  secondaryText: { color: '#bfdbfe', fontWeight: '900', fontSize: 13 },
  ghostButton: { borderColor: '#334155', borderRadius: 999, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12 },
  ghostText: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  error: { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, backgroundColor: '#0b1220', borderColor: '#1e293b', borderWidth: 1, borderRadius: 16, padding: 14, gap: 3 },
  metricValue: { color: '#f8fafc', fontSize: 18, fontWeight: '900' },
  metricLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  sectionTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '900' },
  proofBlock: { backgroundColor: '#07111f', borderRadius: 14, padding: 14, gap: 8 },
  proofState: { color: '#60a5fa', fontSize: 22, fontWeight: '900' },
  listItem: { borderTopColor: '#1e293b', borderTopWidth: 1, paddingTop: 10, gap: 3 },
  itemTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '800' },
  muted: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  boundaryCard: { backgroundColor: '#111827', borderColor: '#7c3aed', borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  boundaryTitle: { color: '#c4b5fd', fontSize: 13, fontWeight: '900' },
  boundaryText: { color: '#a5b4fc', fontSize: 12, lineHeight: 18 },
});
