/**
 * Centralized site configuration for external links and social presence.
 * Update DISCORD_INVITE_URL when the Discord server invite link changes.
 */
export const DISCORD_INVITE_URL = "https://discord.gg/robopartpicker";

export const SUPPORT_EMAIL = "support@robopartpicker.com";

export const SOCIAL_LINKS = {
  discord: DISCORD_INVITE_URL,
  github: "https://github.com/robopartpicker",
  rss: "/feed.xml",
} as const;

export const NEWSLETTER_PLACEHOLDER = "Get project and BOM updates";
