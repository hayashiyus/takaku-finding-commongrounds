// Vercel Function（Edge）— 型付き関係分類（SPEC §7.3）＋ ルーム単位の呼び出し上限（quota）。
// APIキー（LLM_API_KEY）・service_role キーはサーバ側 process.env のみで参照。クライアントへは出さない。
import { classify } from './_classify';

export const config = { runtime: 'edge' };

function json(d: unknown, s = 200): Response {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * rooms.llm_calls を RPC increment_llm_calls で原子的に加算＆上限チェック。
 * - mode='pro' の行のみ加算可（DB側で保証）→ lite/存在しない room は false。
 * - fail-open: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定なら quota をスキップ
 *   （旧デプロイ設定のまま動く。授業/講演を止めないことを優先）。RPCエラー時も同様。
 */
async function checkQuota(roomId: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[quota] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY unset - fail-open (quota disabled)');
    return true; // fail-open（未設定）
  }
  const max = Number(process.env.LLM_MAX_CALLS_PER_ROOM ?? 400);
  try {
    const res = await fetch(`${url}/rest/v1/rpc/increment_llm_calls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_room_id: roomId, p_max: max }),
    });
    if (!res.ok) {
      console.warn('[quota] rpc failed', res.status, '- fail-open');
      return true; // fail-open（RPC異常）
    }
    const ok = (await res.json()) as unknown;
    return ok === true;
  } catch (e) {
    console.warn('[quota] rpc error - fail-open', e);
    return true; // fail-open（ネットワーク等）
  }
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
