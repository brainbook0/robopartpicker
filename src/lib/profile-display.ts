export type DisplayProfile = {
  display_name?: string | null;
  username?: string | null;
};

export function profileName(profile: DisplayProfile | null | undefined): string {
  return profile?.display_name || profile?.username || "anon";
}

export function profileInitials(profile: DisplayProfile | null | undefined): string {
  return profileName(profile)
    .split(/\s+/u)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
