// Vercel Edge Function — 候補ノードの型付き関係分類（SPEC §7.3）
// Phase 0: 足場（空を返す）。Phase 3 で LLM(tool use / 構造化出力) を実装。
// APIキー（LLM_API_KEY）はこのサーバ側でのみ参照し、クライアントへは絶対に出さない。
export const config = { runtime: 'edge' };

// SPEC §7.3 の分類プロンプト（Phase 3 で使用）。
const SYSTEM_PROMPT = `あなたは、議論の断片どうしの意味関係を判定する分類器です。中心ノード1件と候補ノード複数件が与えられます。各候補について、中心ノードとの関係を次から1つ選び、確信度(0–1)と20字程度の理由を返してください。誰が書いたか・表現の巧拙は一切考慮せず、文の意味だけで一貫した基準で判定してください。
- supports（根拠づける）/ contradicts（対立する）/ elaborates（具体化する）/ reframes（再枠組みする）/ none（関連なし）
迷う場合・関係が弱い場合は none か低い確信度にし、無理に結ばないこと。出力は指定のJSONのみ。`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json();
    void body;
    void SYSTEM_PROMPT;
    // TODO(Phase 3): selectCandidates の結果を受け取り、LLM の tool use で
    //   { links: [{ neighbor_id, relation, direction, confidence, rationale }] } を生成。
    //   relation!=none かつ confidence>=LINK_CONFIDENCE_THRESHOLD のみ採用。
    //   モデル名/料金/tool use 仕様は実装時に公式ドキュメントで確認すること。
    return json({ links: [] });
  } catch {
    return json({ links: [] });
  }
}
