/**
 * Centralized site configuration for external links and social presence.
 *
 * DISCORD_INVITE_URL points at the real RoboPartPicker server. It was previously
 * `discord.gg/robopartpicker`, which Discord's API rejected as an unknown invite while
 * three live surfaces advertised it. Verify any replacement resolves before shipping it:
 * https://discord.com/api/v10/invites/<code>
 */
export const DISCORD_INVITE_URL = "https://discord.gg/b3HkNUFMzW";

/** Public issue tracker, for corrections and catalog fixes. */
export const COMMUNITY_URL = "https://github.com/brainbook0/robopartpicker/issues";

export const SUPPORT_EMAIL = "support@robopartpicker.com";

export const SOCIAL_LINKS = {
  discord: DISCORD_INVITE_URL,
  github: "https://github.com/brainbook0/robopartpicker",
  rss: "/feed.xml",
} as const;

export const NEWSLETTER_PLACEHOLDER = "Get project and BOM updates";
