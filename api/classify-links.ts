// Vercel Function（Edge）— 型付き関係分類（SPEC §7.3）。
// APIキー（LLM_API_KEY）はサーバ側 process.env のみで参照。クライアントへは出さない。
import { classify } from './_classify';

export const config = { runtime: 'edge' };

function json(d: unknown, s = 200): Response {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json();
    const out = await classify(body, {
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      provider: process.env.LLM_PROVIDER,
      threshold: process.env.LINK_CONFIDENCE_THRESHOLD
        ? Number(process.env.LINK_CONFIDENCE_THRESHOLD)
        : 0.6,
    });
    return json(out);
  } catch (e) {
    // 失敗時も 200 + 空 links（線を引かない＝§7.2 孤立許容）。クライアントは壊さない。
    return json({ links: [], error: String((e as Error)?.message || e) });
  }
}
