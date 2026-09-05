import type { Env } from "../env";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export function isEmailDeliveryConfigured(env: Env): boolean {
  return Boolean(env.EMAIL_PROVIDER_URL && env.EMAIL_PROVIDER_TOKEN && env.EMAIL_FROM);
}

export async function sendAuthEmail(env: Env, message: OutboundEmail): Promise<void> {
  await sendEmail(env, message);
}

export async function sendEmail(env: Env, message: OutboundEmail): Promise<{ providerMessageId: string | null }> {
  if (!isEmailDeliveryConfigured(env)) {
    throw new Error("Email delivery is not configured for this environment.");
  }

  const response = await fetch(env.EMAIL_PROVIDER_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the request with status ${response.status}.`);
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  return { providerMessageId: typeof payload?.id === "string" ? payload.id : null };
}
