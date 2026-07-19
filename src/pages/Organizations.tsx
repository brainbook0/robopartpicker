import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { organizationsApi, type Organization } from "@/lib/api/organizations";

const toSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9\s-]/gu, "").replace(/\s+/gu, "-").replace(/-+/gu, "-").slice(0, 64);

export default function Organizations() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    organizationsApi.list(controller.signal)
      .then((result) => setItems(result.items))
      .catch((cause: unknown) => { if (!(cause instanceof DOMException)) setError(cause instanceof Error ? cause.message : "Could not load organizations."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [user]);

  const derivedSlug = useMemo(() => slugEdited ? slug : toSlug(name), [name, slug, slugEdited]);

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || derivedSlug.length < 3) return;
    setSaving(true);
    try {
      const result = await organizationsApi.create({ name: name.trim(), slug: derivedSlug, description: description.trim() || null });
      toast.success("Organization created");
      navigate(`/organizations/${result.item.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not create organization.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <StateText>Loading account…</StateText>;
  if (!user) return <StateText>Sign in to create and manage engineering organizations. <Link to="/auth" className="text-primary hover:underline">Sign in</Link></StateText>;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title mb-1">Collaboration</div>
          <h1 className="text-xl font-bold tracking-tight">Organizations</h1>
          <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">Control shared projects, builds, files, and procurement work with server-enforced roles.</p>
        </div>
        <div className="badge-neutral mono">{items.length} memberships</div>
      </div>

      {error && <div className="mb-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">{error}</div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface-card p-3">
          <div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h2 className="text-[13px] font-semibold">Your organizations</h2></div>
          {loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Loading organizations…</div> : items.length === 0 ? (
            <div className="rounded border border-dashed border-border p-8 text-center text-[12px] text-muted-foreground">No organization memberships yet. Create one to collaborate on private engineering records.</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((organization) => (
                <Link key={organization.id} to={`/organizations/${organization.id}`} className="flex items-start gap-3 px-1 py-3 hover:bg-muted/40">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-border bg-muted"><Building2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-medium text-[13px]">{organization.name}</span><span className="badge-neutral mono">{organization.member_role}</span></span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{organization.description || `/${organization.slug}`}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">Manage →</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <form onSubmit={createOrganization} className="surface-card self-start p-4 space-y-3">
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="text-[13px] font-semibold">Create organization</h2></div>
          <Field label="Name"><input className="input-bare w-full" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Slug"><input className="input-bare w-full mono" value={derivedSlug} maxLength={64} onChange={(event) => { setSlugEdited(true); setSlug(toSlug(event.target.value)); }} required /></Field>
          <Field label="Description"><textarea className="input-bare min-h-24 w-full" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} /></Field>
          <button className="btn-primary btn-sm w-full" disabled={saving || name.trim().length < 2 || derivedSlug.length < 3}><ShieldCheck className="h-3.5 w-3.5" /> {saving ? "Creating…" : "Create with owner role"}</button>
          <p className="text-[10.5px] text-muted-foreground">Membership and all private-resource permissions are checked by the Worker, not by button visibility.</p>
        </form>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>{children}</label>;
const StateText = ({ children }: { children: React.ReactNode }) => <div className="mx-auto max-w-[1180px] px-4 py-10 text-[12px] text-muted-foreground">{children}</div>;
