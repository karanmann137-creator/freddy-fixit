// Draws a Freddy Fix It social graphic (1080x1350 PNG) for one row of
// public.social_cards. Text comes only from that table, so nobody can make a
// branded image with their own words by editing the URL.
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const NAVY = "#1a2236", DEEP = "#111827", ORANGE = "#ea6b14", TEXT = "#f0f4ff";

type Card = { kicker: string; headline: string; body: string };
type El = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown): El =>
  ({ type, props: { style: { display: "flex", ...style }, children } });

export function cardElement(c: Card): El {
  const hl = c.headline.length;
  const hSize = hl <= 28 ? 124 : hl <= 48 ? 100 : hl <= 75 ? 82 : 68;
  const lines = c.body.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const bSize = lines.join(" ").length > 220 ? 38 : 44;
  return el("div", {
    width: "100%", height: "100%", flexDirection: "column", justifyContent: "space-between",
    padding: "84px 80px 72px", color: TEXT, fontFamily: "sans-serif",
    backgroundImage: `linear-gradient(165deg, ${NAVY} 0%, ${DEEP} 100%)`,
  }, [
    el("div", { flexDirection: "column" }, [
      el("div", { alignItems: "center", marginBottom: 44 }, [
        el("div", { width: 64, height: 8, background: ORANGE, borderRadius: 4, marginRight: 22 }),
        el("div", { fontSize: 32, letterSpacing: 5, color: ORANGE, fontWeight: 700 }, c.kicker.toUpperCase().slice(0, 34)),
      ]),
      el("div", { fontSize: hSize, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2 }, c.headline),
      el("div", { flexDirection: "column", marginTop: 56 }, lines.map((t) =>
        el("div", { fontSize: bSize, lineHeight: 1.32, opacity: 0.86, marginBottom: 20 }, [
          lines.length > 1 ? el("div", { width: 14, height: 14, borderRadius: 7, background: ORANGE, marginTop: bSize * 0.45, marginRight: 24, flexShrink: 0 }) : null,
          el("div", { flex: 1 }, t),
        ]))),
    ]),
    el("div", { justifyContent: "space-between", alignItems: "flex-end", borderTop: "2px solid rgba(240,244,255,.16)", paddingTop: 34 }, [
      el("div", { flexDirection: "column" }, [
        el("div", { fontSize: 46, fontWeight: 700 }, "Freddy Fix It"),
        el("div", { fontSize: 28, opacity: 0.7, marginTop: 6 }, "Calgary home services"),
      ]),
      el("div", { fontSize: 32, color: ORANGE, fontWeight: 700 }, "freddyfixit.ca"),
    ]),
  ]);
}

export default async function handler(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad id", { status: 400 });
  const base = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return new Response("Not configured", { status: 500 });
  const r = await fetch(`${base}/rest/v1/social_cards?id=eq.${id}&select=kicker,headline,body`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = r.ok ? ((await r.json()) as Card[]) : [];
  if (!rows.length) return new Response("Not found", { status: 404 });
  return new ImageResponse(cardElement(rows[0]) as never, {
    width: 1080, height: 1350,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
