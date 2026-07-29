import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { isInternalPath } from "@/lib/forum";
import { notificationsApi, type NotificationPreference } from "@/lib/api/notifications";

const preferenceTypes = [
  ["build_activity", "Build activity"],
  ["community_reply", "Community replies"],
  ["marketplace_inquiry", "Marketplace inquiries"],
  ["import_review", "Import review"],
  ["mention", "Mentions"],
  ["message", "Direct messages"],
  ["message_request", "Message requests"],
  ["accepted_answer", "Accepted answers"],
  ["project_change", "Project changes"],
  ["contribution_proposal", "Contribution proposals"],
  ["contribution_review", "Review decisions"],
  ["reproduction", "Reproductions and forks"],
  ["missing_information_resolution", "Resolved information gaps"],
  ["import_completion", "Import completion"],
  ["bom_verification_result", "Verification results"],
  ["saved_search_match", "Saved-search matches"],
  ["availability_change", "Availability and price changes"],
] as const;

export default function Notifications() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const notifications = useQuery({ queryKey: ["notifications", unreadOnly, user?.id], queryFn: ({ signal }) => notificationsApi.list(unreadOnly, signal), enabled: Boolean(user) });
  const preferences = useQuery({ queryKey: ["notification-preferences", user?.id], queryFn: ({ signal }) => notificationsApi.preferences(signal), enabled: Boolean(user) });

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["notification-count"] }),
  ]);

  const markRead = async (id: string) => {
    setBusy(id);
    try { await notificationsApi.markRead(id); await refresh(); }
    catch (error) { toast({ title: "Could not update notification", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const markAllRead = async () => {
    setBusy("all");
    try { const result = await notificationsApi.markAllRead(); await refresh(); toast({ title: `${result.updated} notification${result.updated === 1 ? "" : "s"} marked read` }); }
    catch (error) { toast({ title: "Could not update notifications", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  if (loading) return <Centered><Loader2 className="h-5 w-5 animate-spin" /> Loading account…</Centered>;
  if (!user) return <Centered><Bell className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">Sign in to view notifications</h1><Link to="/auth?next=%2Fnotifications" className="btn-primary">Sign in</Link></Centered>;

  return <div className="mx-auto max-w-5xl px-4 py-6">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><div className="section-title">Account · notification center</div><h1 className="text-[22px] font-bold">Notifications</h1><p className="text-xs text-muted-foreground">D1-persisted alerts with safe links and per-channel preferences.</p></div>
      <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> Unread only</label><button disabled={busy !== null || !notifications.data?.unreadCount} onClick={() => void markAllRead()} className="btn-ghost btn-sm inline-flex items-center gap-1 disabled:opacity-50"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-3"><span className="section-title">Inbox</span><span className="badge-neutral mono">{notifications.data?.unreadCount ?? 0} unread</span></div>
        {notifications.isLoading && <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…</div>}
        {notifications.error && <div className="p-5 text-sm text-negative">{message(notifications.error)}</div>}
        {notifications.data?.items.length === 0 && <div className="p-8 text-center"><Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><div className="text-sm font-medium">{unreadOnly ? "No unread notifications" : "No notifications yet"}</div><p className="mt-1 text-xs text-muted-foreground">Build activity, replies, inquiries, and review alerts will appear here.</p></div>}
        {notifications.data?.items.map((item) => {
          const content = <><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{item.title}</span><span className="badge-neutral text-[9px] uppercase">{item.notificationType.replaceAll("_", " ")}</span>{!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />}</div>{item.body && <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>}<div className="mt-2 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></>;
          return <div key={item.id} className={`flex items-start justify-between gap-3 border-b border-border p-3 last:border-0 ${item.readAt ? "bg-background" : "bg-primary/5"}`}>
            <div className="min-w-0 flex-1">{item.internalPath && isInternalPath(item.internalPath) ? <Link to={item.internalPath} onClick={() => { if (!item.readAt) void markRead(item.id); }} className="block hover:text-primary">{content}</Link> : content}</div>
            {!item.readAt && <button disabled={busy !== null} onClick={() => void markRead(item.id)} className="btn-ghost btn-sm shrink-0 disabled:opacity-50">Mark read</button>}
          </div>;
        })}
      </section>
      <Preferences items={preferences.data?.items ?? []} busy={busy} setBusy={setBusy} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }); }} />
    </div>
  </div>;
}

function Preferences({ items, busy, setBusy, onSaved }: { items: NotificationPreference[]; busy: string | null; setBusy: (value: string | null) => void; onSaved: () => Promise<void> }) {
  const byType = new Map(items.map((item) => [item.notificationType, item]));
  const update = async (notificationType: string, channel: "inAppEnabled" | "emailEnabled" | "pushEnabled", enabled: boolean) => {
    const current = byType.get(notificationType);
    setBusy(`preference-${notificationType}`);
    try {
      await notificationsApi.updatePreference({ notificationType, inAppEnabled: channel === "inAppEnabled" ? enabled : current?.inAppEnabled !== 0, emailEnabled: channel === "emailEnabled" ? enabled : current?.emailEnabled === 1, pushEnabled: channel === "pushEnabled" ? enabled : current?.pushEnabled === 1, deliverySchedule: current?.deliverySchedule ?? "individual" });
      await onSaved();
      toast({ title: "Notification preference saved" });
    } catch (error) { toast({ title: "Could not save preference", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };
  const schedule = async (notificationType: string, deliverySchedule: NotificationPreference["deliverySchedule"]) => { const current = byType.get(notificationType); setBusy(`preference-${notificationType}`); try { await notificationsApi.updatePreference({ notificationType, inAppEnabled: current?.inAppEnabled !== 0, emailEnabled: current?.emailEnabled === 1, pushEnabled: current?.pushEnabled === 1, deliverySchedule }); await onSaved(); } catch (error) { toast({ title: "Could not save preference", description: message(error), variant: "destructive" }); } finally { setBusy(null); } };
  return <aside className="surface-card self-start p-3"><div className="section-title mb-1">Preferences</div><p className="mb-3 text-[11px] text-muted-foreground">Choose individual, batched, or digest delivery. Email and push require configured providers.</p><div className="space-y-3">{preferenceTypes.map(([type, label]) => { const item = byType.get(type); const disabled = busy === `preference-${type}`; return <div key={type} className="rounded border border-border p-2"><div className="mb-2 text-xs font-medium">{label}</div><div className="flex flex-wrap gap-3"><label className="inline-flex items-center gap-1.5 text-[11px]"><input type="checkbox" disabled={disabled} checked={item?.inAppEnabled !== 0} onChange={(event) => void update(type, "inAppEnabled", event.target.checked)} /> In app</label><label className="inline-flex items-center gap-1.5 text-[11px]"><input type="checkbox" disabled={disabled} checked={item?.emailEnabled === 1} onChange={(event) => void update(type, "emailEnabled", event.target.checked)} /> Email</label><label className="inline-flex items-center gap-1.5 text-[11px]"><input type="checkbox" disabled={disabled} checked={item?.pushEnabled === 1} onChange={(event) => void update(type, "pushEnabled", event.target.checked)} /> Push</label></div><select aria-label={`${label} delivery schedule`} disabled={disabled} className="input-bare mt-2 text-[11px]" value={item?.deliverySchedule ?? "individual"} onChange={(event) => void schedule(type, event.target.value as NotificationPreference["deliverySchedule"])}><option value="individual">Individual</option><option value="batched">Batched</option><option value="daily_digest">Daily digest</option><option value="weekly_digest">Weekly digest</option><option value="off">Off</option></select></div>; })}</div></aside>;
}

function Centered({ children }: { children: React.ReactNode }) { return <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">{children}</div>; }
function message(error: unknown): string { return error instanceof Error ? error.message : "Unexpected error."; }
