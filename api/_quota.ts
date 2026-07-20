// 共有: ルーム単位のLLM呼び出し上限チェック。classify-links.ts と synthesize.ts の双方から呼ぶ。

/**
 * rooms.llm_calls を RPC increment_llm_calls で原子的に加算＆上限チェック。
 * - mode='pro' の行のみ加算可（DB側で保証）→ lite/存在しない room は false。
 * - fail-open: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定なら quota をスキップ
 *   （旧デプロイ設定のまま動く。授業/講演を止めないことを優先）。RPCエラー時も同様。
 */
export async function checkQuota(roomId: string): Promise<boolean> {
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
