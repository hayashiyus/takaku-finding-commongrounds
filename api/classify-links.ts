// Vercel Function（Edge）— 型付き関係分類（SPEC §7.3）＋ ルーム単位の呼び出し上限（quota）。
// APIキー（LLM_API_KEY）・service_role キーはサーバ側 process.env のみで参照。クライアントへは出さない。
import { classify } from './_classify';
import { checkQuota } from './_quota';

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
    const roomId: string | undefined =
      typeof body?.room_id === 'string' ? body.room_id : undefined;
    // 旧クライアント互換: room_id 無しは 200 + 空 links（線ゼロ、クラッシュさせない）
    if (!roomId) return json({ links: [], error: 'room_required' });
    if (!(await checkQuota(roomId)))
      return json({ links: [], error: 'quota_exceeded' });

    // 入力クランプ（無認証エンドポイントのトークン浪費対策）: 候補≤12件・本文≤400字
    const cap = (n: { id?: unknown; type?: unknown; text?: unknown }) => ({
      id: String(n?.id ?? ''),
      type: String(n?.type ?? 'fact'),
      text: String(n?.text ?? '').slice(0, 400),
    });
    body.candidates = (Array.isArray(body.candidates) ? body.candidates : [])
      .slice(0, 12)
      .map(cap);
    if (body.target) body.target = cap(body.target);

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
    // 上流（Anthropic等）のエラー本文は漏らさずサーバログのみに残す。
    console.error('[classify-links] upstream error:', e);
    return json({ links: [], error: 'llm_error' });
  }
}
