import { createClient } from "npm:@supabase/supabase-js@2";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai@5";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1";
import { z } from "npm:zod@3";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const gateway = createOpenAICompatible({
  name: "lovable",
  baseURL: "https://ai.gateway.lovable.dev/v1",
  headers: { "Lovable-API-Key": LOVABLE_API_KEY },
});

const SYSTEM = `You are the RoboPartPicker Build Assistant.

You help users design, spec, cost, and troubleshoot open-source robotics builds. You are grounded in this app's catalog of parts, suppliers, projects (RPPS), BOMs, and community builds.

Rules:
- Prefer using tools to look up real data instead of guessing. Never invent SKUs, prices, or project details.
- When recommending parts, cite them by name and category from the catalog.
- When discussing projects, use the exact slug so links resolve (/projects/<slug>, /parts/<category>/<slug>).
- Use concise, technical language. Include units (mm, N·m, V, A, W). Prefer markdown tables for BOM comparisons.
- If the user asks about pricing, use search_parts and mention the currency and that pricing comes from listed suppliers.
- If nothing is found, say so plainly and suggest a related search.`;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const messages: UIMessage[] = body.messages ?? [];
    const threadId: string = body.threadId;
    if (!threadId) return json({ error: "threadId required" }, 400);

    const db = admin();

    // Verify thread ownership
    const { data: thread } = await db.from("chat_threads").select("id,user_id,title").eq("id", threadId).maybeSingle();
    if (!thread || thread.user_id !== userId) return json({ error: "Thread not found" }, 404);

    // Persist the latest user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await db.from("chat_messages").insert({
        thread_id: threadId,
        user_id: userId,
        role: "user",
        parts: lastUser.parts as unknown as object,
      });
      // Auto-title on first user turn
      if (thread.title === "New chat") {
        const text = extractText(lastUser).slice(0, 80);
        if (text) await db.from("chat_threads").update({ title: text, updated_at: new Date().toISOString() }).eq("id", threadId);
      } else {
        await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      }
    }

    const tools = {
      search_parts: tool({
        description: "Search the parts catalog by keyword and optional category slug (e.g. motors, mcu, sensors). Returns up to 10 parts with name, slug, category, manufacturer, and price range.",
        inputSchema: z.object({
          query: z.string().describe("Free-text search across part name and description"),
          category: z.string().optional().describe("Optional category slug filter"),
          limit: z.number().optional().default(10),
        }),
        execute: async ({ query, category, limit }) => {
          let q = db
            .from("parts")
            .select("id,name,slug,description,price_min,price_max,currency,category_id,manufacturer_id,categories(slug,name),manufacturers(name)")
            .limit(Math.min(limit ?? 10, 20));
          if (query) q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
          if (category) {
            const { data: cat } = await db.from("categories").select("id").eq("slug", category).maybeSingle();
            if (cat) q = q.eq("category_id", cat.id);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          return { results: (data ?? []).map((p: any) => ({
            slug: p.slug,
            name: p.name,
            category: p.categories?.slug,
            manufacturer: p.manufacturers?.name,
            price: p.price_min && p.price_max ? `${p.price_min}-${p.price_max} ${p.currency ?? "USD"}` : null,
            summary: (p.description ?? "").slice(0, 200),
            url: p.categories?.slug ? `/parts/${p.categories.slug}/${p.slug}` : null,
          })) };
        },
      }),
      get_part: tool({
        description: "Fetch full details for a single part by its slug, including suppliers and tags.",
        inputSchema: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const { data, error } = await db
            .from("parts")
            .select("*,categories(slug,name),manufacturers(name,website),part_suppliers(price,currency,url,in_stock,suppliers(name,slug))")
            .eq("slug", slug)
            .maybeSingle();
          if (error) return { error: error.message };
          if (!data) return { error: "Not found" };
          return data;
        },
      }),
      search_projects: tool({
        description: "Search standardized (RPPS) projects and community builds by title or description.",
        inputSchema: z.object({ query: z.string(), limit: z.number().optional().default(8) }),
        execute: async ({ query, limit }) => {
          const { data, error } = await db
            .from("projects")
            .select("slug,title,summary,status,difficulty,estimated_cost")
            .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
            .limit(Math.min(limit ?? 8, 20));
          if (error) return { error: error.message };
          return { results: (data ?? []).map((p: any) => ({ ...p, url: `/projects/${p.slug}` })) };
        },
      }),
      get_project: tool({
        description: "Fetch a standardized project with its latest RPPS version (BOM, assembly steps).",
        inputSchema: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const { data: project } = await db.from("projects").select("*").eq("slug", slug).maybeSingle();
          if (!project) return { error: "Not found" };
          const { data: versions } = await db
            .from("project_versions")
            .select("*")
            .eq("project_id", project.id)
            .order("created_at", { ascending: false })
            .limit(1);
          return { project, latestVersion: versions?.[0] ?? null };
        },
      }),
      list_categories: tool({
        description: "List all part categories available in the catalog.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await db.from("categories").select("slug,name,description");
          return { categories: data ?? [] };
        },
      }),
      estimate_bom_cost: tool({
        description: "Given a list of {slug, qty} entries, compute an estimated total cost using the median of listed supplier prices per part.",
        inputSchema: z.object({
          items: z.array(z.object({ slug: z.string(), qty: z.number().int().positive() })).min(1),
        }),
        execute: async ({ items }) => {
          const rows: any[] = [];
          let total = 0;
          let currency = "USD";
          for (const it of items) {
            const { data: part } = await db
              .from("parts")
              .select("id,name,slug,price_min,price_max,currency,part_suppliers(price,currency)")
              .eq("slug", it.slug)
              .maybeSingle();
            if (!part) { rows.push({ slug: it.slug, error: "not found" }); continue; }
            const supplierPrices = (part.part_suppliers ?? []).map((s: any) => s.price).filter((n: any) => typeof n === "number");
            const price = median(supplierPrices) ?? part.price_min ?? part.price_max ?? 0;
            currency = part.currency ?? currency;
            const line = price * it.qty;
            total += line;
            rows.push({ slug: it.slug, name: part.name, qty: it.qty, unit_price: price, line_total: line });
          }
          return { currency, total: Math.round(total * 100) / 100, rows };
        },
      }),
    };

    const result = streamText({
      model: gateway.chatModel("google/gemini-2.5-flash"),
      system: SYSTEM,
      messages: convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
    });

    return result.toUIMessageStreamResponse({
      headers: corsHeaders,
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        try {
          await db.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "assistant",
            parts: responseMessage.parts as unknown as object,
          });
          await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        } catch (e) {
          console.error("persist assistant failed", e);
        }
      },
    });
  } catch (e) {
    console.error("chat error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function extractText(m: UIMessage): string {
  return (m.parts ?? [])
    .map((p: any) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}