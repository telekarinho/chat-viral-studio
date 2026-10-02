// Supabase Edge Function `kick-worker` (Deno): acorda o servidor de edição na hora em que a montagem é pedida.
// O agendamento do GitHub (a cada 5 min) atrasa horas na prática; isto dispara o workflow do worker direto.
// Segredo GH_WORKER_TOKEN: token "fine-grained" do GitHub só com Actions: Read and write no repositório.
// Só usuário logado chama (Verify JWT ligado); o próprio workflow descarta o disparo se não houver nada na fila.
const REPO = "telekarinho/chat-viral-studio";
const WORKFLOW = "postai-render-worker.yml";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const token = Deno.env.get("GH_WORKER_TOKEN");
  if (!token) return Response.json({ ok: false, reason: "not_configured" }, { status: 503 });
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "postai-kick" },
    body: JSON.stringify({ ref: "main" }),
  });
  // 204 = disparado; com um já rodando, o GitHub enfileira só um (concurrency do workflow)
  if (res.status !== 204) console.error(JSON.stringify({ msg: "kick.failed", status: res.status }));
  return Response.json({ ok: res.status === 204 }, { status: res.status === 204 ? 200 : 502 });
});
