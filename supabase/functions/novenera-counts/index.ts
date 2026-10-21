// Sahm → Novenera: each teacher's student numbers (all / frozen / active / online only).
// Only the signed-in owner (is_owner()) can call it. The key for Novenera's billing-api lives in the
// private table integration_keys (no browser access), so it never reaches the page or this repo.
// Body: { days?: { "<novenera teacher id>": "YYYY-MM-DD" } } → numbers on that renewal day too.
import { createClient } from "npm:@supabase/supabase-js@2";

const NOVENERA = "https://iiqxeaocbkqehltqodgp.supabase.co/functions/v1/billing-api";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: owner } = await user.rpc("is_owner");
  if (owner !== true) return json({ error: "forbidden" }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: k } = await admin.from("integration_keys").select("secret").eq("id", "novenera_billing").single();
  if (!k?.secret) return json({ error: "not_configured" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  try {
    const r = await fetch(NOVENERA, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-billing-key": k.secret },
      body: JSON.stringify({ days: body?.days ?? {} }),
    });
    if (!r.ok) return json({ error: "novenera_" + r.status }, 502);
    return json(await r.json());
  } catch {
    return json({ error: "novenera_unreachable" }, 502);
  }
});
