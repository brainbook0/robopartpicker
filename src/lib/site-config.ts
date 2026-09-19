/**
 * Centralized site configuration for external links and social presence.
 *
 * There is no Discord server. The old `discord.gg/robopartpicker` invite returned
 * "Unknown Invite" from Discord's API while three live surfaces advertised it, so it
 * was removed rather than left pointing at a community that does not exist. When a
 * real server exists, add its invite here and point the community call to actions at it.
 */
export const COMMUNITY_URL = "https://github.com/brainbook0/robopartpicker/issues";

export const SUPPORT_EMAIL = "support@robopartpicker.com";

export const SOCIAL_LINKS = {
  github: "https://github.com/brainbook0/robopartpicker",
  rss: "/feed.xml",
} as const;

export const NEWSLETTER_PLACEHOLDER = "Get project and BOM updates";
