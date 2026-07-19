import type { Env } from "../env";

type AuthEmail = {
  to: string;
  subject: string;
  text: string;
};

export function isEmailDeliveryConfigured(env: Env): boolean {
  return Boolean(env.EMAIL_PROVIDER_URL && env.EMAIL_PROVIDER_TOKEN && env.EMAIL_FROM);
}

export async function sendAuthEmail(env: Env, message: AuthEmail): Promise<void> {
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
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the request with status ${response.status}.`);
  }
}
