// Vercel Edge Function — 連結グラフを1–2文に要約（SPEC §7.6 / 任意 SHOULD）
// Phase 0: 足場（空を返す）。Phase 6 で任意実装。
export const config = { runtime: 'edge' };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  // TODO(Phase 6 / 任意): nodes+edges を LLM で 1–2 文に要約して返す。
  return json({ summary: '' });
}
