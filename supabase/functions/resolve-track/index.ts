// resolve-track: retired. Listentoo no longer uses YouTube for playback; full-length audio comes
// from Audius, Jamendo, live radio and local files, all played with the native audio element.
// Kept as a stub so older cached clients get a clear answer instead of an error.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return new Response(JSON.stringify({ error: "gone", message: "La reproducción vía YouTube se ha retirado." }), {
    status: 410,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
