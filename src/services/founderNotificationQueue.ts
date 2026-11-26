import { createHash } from 'node:crypto';
import type { FounderNotificationIntent } from '../buildEvents/founderNotificationIntent.js';

export function notificationEventRow(projectId: string, intent: FounderNotificationIntent) {
  const digest = createHash('sha256').update(intent.key).digest('hex');
  return {
    project_id: projectId,
    source_event_id: 'founder-notification:' + digest,
    event_type: 'founder_notification_intent',
    severity: 'info',
    screen: 'founder-notifications',
    provider: 'github',
    decision: null,
    metadata: { contract: 'fcr/founder-notification@v1', delivery: 'queued', intent },
    created_at: intent.occurredAt,
  };
}
