// resolve-track: finds the official full-length YouTube video for a catalog track.
// Signed-in users only. Results are cached for everyone in public.yt_matches so each
// song costs YouTube quota once. The API key lives server-side (env YOUTUBE_API_KEY or
// the admin-managed row in public.app_secrets) and never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DAILY_LIMIT = 300; // new (uncached) lookups per user per day
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isoDur = (s = "") => {
  const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
};
const norm = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\((?:feat|ft|with|con)[^)]*\)|\[(?:feat|ft|with|con)[^\]]*\]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const BAD = /\b(live|en vivo|ao vivo|cover|karaoke|instrumental|reaction|reaccion|8d|slowed|reverb|sped up|nightcore|tutorial|remix|letra|lyrics)\b/;

type Want = { title: string; artist: string; dur: number };
type Item = { id: { videoId: string }; snippet: { title: string; channelTitle: string } };

function score(item: Item, det: { dur: number; embeddable: boolean } | undefined, want: Want) {
  const t = norm(item.snippet.title), ch = norm(item.snippet.channelTitle), wt = norm(want.title), wa = norm(want.artist);
  const words = wt.split(" ").filter((w) => w.length > 1);
  let s = (words.filter((w) => t.includes(w)).length / Math.max(1, words.length)) * 6;
  const firstArtist = wa.split(" ")[0] || "";
  if ((firstArtist && t.includes(firstArtist)) || (wa && ch.includes(wa))) s += 3;
  if (/ - topic$/i.test(item.snippet.channelTitle)) s += 4;
  if (/vevo/i.test(item.snippet.channelTitle) || /official (audio|video|music video)|audio oficial|video oficial|videoclip oficial/i.test(item.snippet.title)) s += 2;
  const bad = t.match(BAD);
  if (bad && !wt.includes(bad[1])) s -= 6;
  if (det) {
    if (!det.embeddable) s -= 100;
    if (want.dur) { const d = Math.abs(det.dur - want.dur); s += d <= 3 ? 4 : d <= 10 ? 2 : d <= 30 ? 0 : -5; }
  }
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "auth", message: "Inicia sesión para escuchar canciones completas." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const id = String(body.id ?? "").slice(0, 100);
  const want: Want = { title: String(body.title ?? "").slice(0, 200), artist: String(body.artist ?? "").slice(0, 200), dur: Number(body.dur) || 0 };
  if (!id || !want.title) return json({ error: "bad_request" }, 400);

  const { data: hit } = await db.from("yt_matches").select("video_id").eq("track_id", id).maybeSingle();
  if (hit) return json({ videoId: hit.video_id, cached: true });

  let key = Deno.env.get("YOUTUBE_API_KEY") || "";
  if (!key) {
    const { data } = await db.from("app_secrets").select("value").eq("key", "youtube_api_key").maybeSingle();
    key = data?.value || "";
  }
  if (!key) return json({ error: "not_configured", message: "La reproducción completa aún no está activada." }, 503);

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db.from("resolve_usage").select("n").eq("user_id", user.id).eq("day", today).maybeSingle();
  const used = usage?.n ?? 0;
  if (used >= DAILY_LIMIT) return json({ error: "rate_limited", message: "Has alcanzado el límite diario de canciones nuevas." }, 429);
  await db.from("resolve_usage").upsert({ user_id: user.id, day: today, n: used + 1 });

  const q = `${want.artist} ${want.title}`.trim();
  const sr = await fetch("https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
    part: "snippet", type: "video", maxResults: "8", videoEmbeddable: "true", videoSyndicated: "true", q, key,
  }));
  if (!sr.ok) {
    const e = await sr.json().catch(() => ({}));
    const reason = e?.error?.errors?.[0]?.reason || String(sr.status);
    return json({ error: reason === "quotaExceeded" ? "quota" : "youtube", reason }, 502);
  }
  const items: Item[] = ((await sr.json()).items || []).filter((i: Item) => i?.id?.videoId);
  if (!items.length) return json({ error: "not_found" }, 404);

  const det = new Map<string, { dur: number; embeddable: boolean }>();
  const vr = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
    part: "contentDetails,status", id: items.map((i) => i.id.videoId).join(","), key,
  }));
  if (vr.ok) {
    for (const v of (await vr.json()).items || []) {
      det.set(v.id, { dur: isoDur(v.contentDetails?.duration), embeddable: v.status?.embeddable !== false && v.status?.privacyStatus !== "private" });
    }
  }
  const best = items.map((i) => ({ i, s: score(i, det.get(i.id.videoId), want) })).sort((a, b) => b.s - a.s)[0];
  if (!best || best.s < 0) return json({ error: "not_found" }, 404);

  const videoId = best.i.id.videoId;
  await db.from("yt_matches").upsert({ track_id: id, video_id: videoId, query: q });
  return json({ videoId, cached: false });
});
