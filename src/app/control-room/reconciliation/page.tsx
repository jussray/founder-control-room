/**
 * Reconciliation Dashboard Page
 * Route: /control-room/reconciliation
 *
 * Shows drift reports from all registered services in real time.
 * Polls /api/reconciliation/events every 30s.
 */
'use client';

import { useEffect, useState } from 'react';

type DriftItem = { type: string; detail: string };

type ReconciliationEvent = {
  id: string;
  service: string;
  status: 'clean' | 'drift_detected';
  drift: DriftItem[];
  received_at: string;
  duration_ms: number;
};

const SERVICE_LABELS: Record<string, string> = {
  'founder-control-room': 'Control Room',
  'sekret-bip': 'Sekret-Bip',
  'l99-story-engine': 'L99 Story Engine',
};

const DRIFT_KIND_LABELS: Record<string, string> = {
  missing_table: 'Missing Table',
  row_count_zero: 'Empty Table',
  policy_missing: 'Missing RLS Policy',
  schema_invalid: 'Invalid Schema',
  missing_schema: 'Missing Schema',
  manifest_mismatch: 'Manifest Mismatch',
  unknown: 'Unknown',
};

export default function ReconciliationPage() {
  const [events, setEvents] = useState<ReconciliationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function fetchEvents() {
    try {
      const res = await fetch('/api/reconciliation/events');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 30_000);
    return () => clearInterval(interval);
  }, []);

  const services = ['founder-control-room', 'sekret-bip', 'l99-story-engine'] as const;

  // Latest event per service
  const latestByService = services.reduce(
    (acc, svc) => {
      acc[svc] = events.find(e => e.service === svc) ?? null;
      return acc;
    },
    {} as Record<string, ReconciliationEvent | null>
  );

  const driftEvents = events.filter(e => e.status === 'drift_detected');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drift reports from all registered services
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchEvents}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-offset transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {services.map(svc => {
          const latest = latestByService[svc];
          const isClean = latest?.status === 'clean';
          const isDrift = latest?.status === 'drift_detected';
          const isUnknown = !latest;

          return (
            <div
              key={svc}
              className="rounded-lg border border-border bg-surface p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{SERVICE_LABELS[svc] ?? svc}</span>
                <StatusBadge status={latest?.status ?? 'unknown'} />
              </div>
              {latest ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {isDrift ? `${latest.drift.length} drift item${latest.drift.length !== 1 ? 's' : ''}` : 'All clear'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(latest.received_at).toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No reports yet</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Drift Events Feed */}
      {error ? (
        <div className="rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
          Failed to load events: {error}
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-surface-offset animate-pulse" />
          ))}
        </div>
      ) : driftEvents.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="text-sm font-medium">All services are clean</p>
          <p className="text-xs text-muted-foreground">No drift detected across any registered service</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Drift Events ({driftEvents.length})
          </h2>
          {driftEvents.map(event => (
            <DriftEventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    clean: 'bg-success/10 text-success border-success/20',
    drift_detected: 'bg-warning/10 text-warning border-warning/20',
    unknown: 'bg-surface-offset text-muted-foreground border-border',
  };
  const labels = { clean: 'Clean', drift_detected: 'Drift', unknown: 'Unknown' };
  const style = styles[status as keyof typeof styles] ?? styles.unknown;
  const label = labels[status as keyof typeof labels] ?? status;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${style}`}>
      {label}
    </span>
  );
}

function DriftEventCard({ event }: { event: ReconciliationEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-warning/20 bg-warning/5 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-warning/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">⚠️</span>
          <div>
            <span className="text-sm font-medium">
              {SERVICE_LABELS[event.service] ?? event.service}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {event.drift.length} item{event.drift.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {new Date(event.received_at).toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-warning/20 divide-y divide-border">
          {event.drift.map((item, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-offset text-muted-foreground whitespace-nowrap">
                {DRIFT_KIND_LABELS[item.type] ?? item.type}
              </span>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
