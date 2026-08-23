import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Decommissioned one-off diagnostic. Returns 410 Gone; touches no secrets.
serve(() => new Response(JSON.stringify({ status: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
