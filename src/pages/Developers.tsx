import { Bot, Code2, Database, KeyRound, PlugZap, ShieldCheck } from "lucide-react";

export default function Developers() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicConfig = JSON.stringify({ mcpServers: { robopartpicker: { url: `${origin}/mcp` } } }, null, 2);
  return <div className="mx-auto max-w-[1100px] px-4 py-8">
    <div className="section-title">Developers and agents</div>
    <h1 className="mt-1 text-3xl font-bold">Connect to RoboPartPicker data</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Use the public read-only Model Context Protocol endpoint to search robotics projects, components, and suppliers. User-specific project actions use a separate OAuth-protected endpoint with narrow scopes and confirmation gates.</p>

    <div className="mt-6 grid gap-3 md:grid-cols-3">
      <Card icon={Database} title="Public catalog" text="Search projects, retrieve project artifacts, compare components, and inspect supplier records without an account." />
      <Card icon={KeyRound} title="Private workspace" text="OAuth-scoped tools can work with a user's own projects and proposals. Mutating actions remain audited and confirmation-gated." />
      <Card icon={ShieldCheck} title="Honest data" text="Tool output is untrusted source data. Prices are observations, compatibility is not inferred from category, and private records stay private." />
    </div>

    <section className="surface-card mt-6 overflow-hidden">
      <div className="border-b border-border px-4 py-3"><div className="flex items-center gap-2 font-semibold"><PlugZap className="h-4 w-4 text-primary" /> Public MCP</div><p className="mt-1 text-xs text-muted-foreground">Streamable HTTP endpoint. No API key required for public read-only tools.</p></div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div><div className="section-title">Endpoint</div><code className="mt-2 block overflow-x-auto rounded border border-border bg-muted p-3 text-xs">{origin}/mcp</code><div className="mt-3 section-title">Available tools</div><ul className="mt-2 space-y-1 text-xs text-muted-foreground"><li><code>search_projects</code> and <code>get_project</code></li><li><code>search_components</code> and <code>compare_components</code></li><li><code>validate_rpps</code></li></ul></div>
        <div><div className="section-title">Client configuration</div><pre className="mt-2 overflow-x-auto rounded border border-border bg-muted p-3 text-[11px] leading-5">{publicConfig}</pre><p className="mt-2 text-xs leading-5 text-muted-foreground">Select Streamable HTTP (or HTTP) in your MCP client. Opening the endpoint directly in a browser returns an expected <code>406</code> because browser navigation does not request the MCP event-stream transport. <a className="text-primary hover:underline" href="https://github.com/brainbook0/robopartpicker/blob/master/docs/mcp.md">Setup and verification guide</a> · <a className="text-primary hover:underline" href="https://github.com/brainbook0/robopartpicker">Source on GitHub</a>.</p></div>
      </div>
    </section>

    <section className="surface-card mt-4 p-4"><div className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-primary" /> Private MCP</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Endpoint: <code>{origin}/mcp/private</code>. OAuth metadata is published at <code>{origin}/.well-known/oauth-protected-resource/mcp/private</code>. Clients must request only the scopes they need.</p></section>
    <section className="surface-card mt-4 p-4"><div className="flex items-center gap-2 font-semibold"><Code2 className="h-4 w-4 text-primary" /> HTTP API</div><p className="mt-2 text-xs leading-5 text-muted-foreground">The same-origin JSON API under <code>/api/v1</code> powers the site. Machine-readable public API stability is still evolving, so MCP is the recommended external agent interface.</p></section>
  </div>;
}

function Card({ icon: Icon, title, text }: { icon: typeof Database; title: string; text: string }) { return <div className="surface-card p-4"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>; }
