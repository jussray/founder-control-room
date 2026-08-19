export const FCR_EMAIL_FROM = 'welcome@api.foundercontrolroom.org';

export interface ProjectEmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
  }): Promise<{ messageId: string }>;
}

export interface FounderControlRoomEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

function requireText(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`fcr_email_missing_${name}`);
  return trimmed;
}

export function isProjectEmailBinding(value: unknown): value is ProjectEmailBinding {
  return Boolean(
    value
      && typeof value === 'object'
      && 'send' in value
      && typeof (value as { send?: unknown }).send === 'function',
  );
}

/**
 * FCR-only outbound email boundary.
 *
 * Callers provide the recipient and content but never the sender identity. The
 * sender is pinned here and independently allowlisted by wrangler.worker.toml,
 * so code copied from another project cannot silently send as that project.
 */
export async function sendFounderControlRoomEmail(
  binding: ProjectEmailBinding,
  input: FounderControlRoomEmailInput,
): Promise<string> {
  if (!isProjectEmailBinding(binding)) throw new Error('fcr_email_binding_unavailable');

  const to = requireText(input.to, 'recipient');
  const subject = requireText(input.subject, 'subject');
  const html = input.html?.trim() || undefined;
  const text = input.text?.trim() || undefined;
  const replyTo = input.replyTo?.trim() || undefined;

  if (!html && !text) throw new Error('fcr_email_missing_body');

  const result = await binding.send({
    to,
    from: FCR_EMAIL_FROM,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
  const messageId = result?.messageId?.trim();
  if (!messageId) throw new Error('fcr_email_missing_message_id');
  return messageId;
}
