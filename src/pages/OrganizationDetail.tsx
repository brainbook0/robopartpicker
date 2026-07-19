import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Save, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { organizationsApi, type Organization, type OrganizationMember, type OrganizationRole } from "@/lib/api/organizations";

const MEMBER_ROLES: Array<Exclude<OrganizationRole, "owner">> = ["admin", "engineer", "builder", "procurement", "viewer"];

export default function OrganizationDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Exclude<OrganizationRole, "owner">>("engineer");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const [organizationResult, membersResult] = await Promise.all([organizationsApi.get(id, signal), organizationsApi.members(id, signal)]);
    setOrganization(organizationResult.item);
    setMembers(membersResult.items);
    setName(organizationResult.item.name);
    setSlug(organizationResult.item.slug);
    setDescription(organizationResult.item.description ?? "");
  }, [id]);

  useEffect(() => {
    if (!user || !id) { setLoading(false); return; }
    const controller = new AbortController();
    reload(controller.signal).catch((cause: unknown) => {
      if (!(cause instanceof DOMException)) setError(cause instanceof Error ? cause.message : "Could not load organization.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, reload, user]);

  const canAdmin = organization?.member_role === "owner" || organization?.member_role === "admin";

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setBusy("settings");
    try {
      const result = await organizationsApi.update(organization.id, { name: name.trim(), slug: slug.trim(), description: description.trim() || null, version: organization.version });
      setOrganization({ ...result.item, member_role: organization.member_role });
      toast.success("Organization settings saved");
    } catch (cause) { toast.error(message(cause)); } finally { setBusy(null); }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setBusy("add");
    try {
      await organizationsApi.addMember(organization.id, { email: email.trim(), role: newRole });
      setEmail("");
      setMembers((await organizationsApi.members(organization.id)).items);
      toast.success("Member added");
    } catch (cause) { toast.error(message(cause)); } finally { setBusy(null); }
  }

  async function changeMember(member: OrganizationMember, role: OrganizationRole, status: OrganizationMember["status"]) {
    if (!organization) return;
    setBusy(member.user_id);
    try {
      const result = await organizationsApi.updateMember(organization.id, member.user_id, { role, status });
      setMembers((current) => current.map((item) => item.user_id === member.user_id ? result.item : item));
      toast.success("Membership updated");
    } catch (cause) { toast.error(message(cause)); } finally { setBusy(null); }
  }

  async function removeMember(member: OrganizationMember) {
    if (!organization || !confirm(`Remove ${member.display_name || member.email} from ${organization.name}?`)) return;
    setBusy(member.user_id);
    try {
      await organizationsApi.removeMember(organization.id, member.user_id);
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      toast.success("Member removed");
    } catch (cause) { toast.error(message(cause)); } finally { setBusy(null); }
  }

  if (authLoading || loading) return <StateText>Loading organization…</StateText>;
  if (!user) return <StateText>Sign in to view organization resources. <Link to="/auth" className="text-primary hover:underline">Sign in</Link></StateText>;
  if (error || !organization) return <StateText>{error || "Organization not found."}</StateText>;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5">
      <Link to="/organizations" className="mb-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Organizations</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded border border-border bg-muted"><Building2 className="h-5 w-5" /></span><div><h1 className="text-xl font-bold tracking-tight">{organization.name}</h1><p className="text-[11px] text-muted-foreground mono">/{organization.slug}</p></div></div>
        <span className="badge-neutral mono">your role: {organization.member_role}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h2 className="text-[13px] font-semibold">Members</h2></div><span className="badge-neutral mono">{members.length}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] text-[12px]">
              <thead className="border-b border-border text-left text-[11px] text-muted-foreground"><tr><th className="py-2 font-medium">Member</th><th className="font-medium">Role</th><th className="font-medium">Status</th><th className="text-right font-medium">Action</th></tr></thead>
              <tbody>{members.map((member) => {
                const availableRoles: OrganizationRole[] = organization.member_role === "owner" ? ["owner", ...MEMBER_ROLES] : MEMBER_ROLES;
                return <tr key={member.user_id} className="border-b border-border/60">
                  <td className="py-2 pr-3"><div className="font-medium">{member.display_name || member.username || member.email}</div><div className="text-[10.5px] text-muted-foreground">{member.email}{member.user_id === user.id ? " · you" : ""}</div></td>
                  <td className="pr-3"><select aria-label={`Role for ${member.email}`} className="input-bare min-w-28" value={member.role} disabled={!canAdmin || busy === member.user_id} onChange={(event) => changeMember(member, event.target.value as OrganizationRole, member.status)}>{!availableRoles.includes(member.role) && <option value={member.role}>{member.role}</option>}{availableRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></td>
                  <td className="pr-3"><select aria-label={`Status for ${member.email}`} className="input-bare min-w-24" value={member.status} disabled={!canAdmin || busy === member.user_id} onChange={(event) => changeMember(member, member.role, event.target.value as OrganizationMember["status"])}><option value="active">active</option><option value="suspended">suspended</option></select></td>
                  <td className="text-right"><button className="btn-ghost btn-sm text-destructive" disabled={!canAdmin || busy === member.user_id} onClick={() => removeMember(member)} aria-label={`Remove ${member.email}`}><Trash2 className="h-3.5 w-3.5" /> Remove</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <p className="mt-3 text-[10.5px] text-muted-foreground">Owners and admins manage membership. Only owners can grant ownership, and the Worker prevents removing or suspending the final active owner.</p>
        </section>

        <aside className="space-y-3">
          {canAdmin && <form onSubmit={addMember} className="surface-card p-4 space-y-3"><div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h2 className="text-[13px] font-semibold">Add existing account</h2></div><Field label="Account email"><input type="email" required maxLength={320} className="input-bare w-full" value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Role"><select className="input-bare w-full" value={newRole} onChange={(event) => setNewRole(event.target.value as typeof newRole)}>{MEMBER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></Field><button className="btn-primary btn-sm w-full" disabled={busy === "add"}><UserPlus className="h-3.5 w-3.5" /> {busy === "add" ? "Adding…" : "Add member"}</button><p className="text-[10.5px] text-muted-foreground">The person must already have a RoboPartPicker account. Email invitations remain a provider integration boundary.</p></form>}
          <form onSubmit={saveSettings} className="surface-card p-4 space-y-3"><h2 className="text-[13px] font-semibold">Organization settings</h2><Field label="Name"><input required maxLength={100} className="input-bare w-full" value={name} disabled={!canAdmin} onChange={(event) => setName(event.target.value)} /></Field><Field label="Slug"><input required maxLength={64} className="input-bare w-full mono" value={slug} disabled={!canAdmin} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, ""))} /></Field><Field label="Description"><textarea maxLength={2000} className="input-bare min-h-24 w-full" value={description} disabled={!canAdmin} onChange={(event) => setDescription(event.target.value)} /></Field>{canAdmin ? <button className="btn-primary btn-sm w-full" disabled={busy === "settings"}><Save className="h-3.5 w-3.5" /> {busy === "settings" ? "Saving…" : "Save settings"}</button> : <p className="text-[10.5px] text-muted-foreground">Your role has read-only access to organization settings.</p>}</form>
        </aside>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>{children}</label>;
const StateText = ({ children }: { children: React.ReactNode }) => <div className="mx-auto max-w-[1180px] px-4 py-10 text-[12px] text-muted-foreground">{children}</div>;
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The request could not be completed.";
