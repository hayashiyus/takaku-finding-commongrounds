// 共有: 候補ノードの型付き関係分類（SPEC §7.3）。
// Vercel Function（api/classify-links.ts）と dev用 vite プラグインの双方から呼ぶ。
// APIキーは呼び出し側(env)から渡す。このモジュールに秘密はハードコードしない。
// 自己完結（src への依存なし）にして、ランタイム差異・型検査の影響を避ける。

type NodeType = 'fact' | 'insight' | 'idea' | 'hypothesis';
type Rel = 'supports' | 'contradicts' | 'elaborates' | 'reframes';
type RelOrNone = Rel | 'none';
type Direction =
  | 'from_target_to_neighbor'
  | 'from_neighbor_to_target'
  | 'undirected';

interface CandidateNode {
  id: string;
  type: NodeType;
  text: string;
}
interface ClassifyBody {
  target: CandidateNode;
  candidates: CandidateNode[];
}
interface Link {
  neighbor_id: string;
  relation: RelOrNone;
  direction: Direction;
  confidence: number;
  rationale: string;
}
export interface ClassifyEnv {
  apiKey?: string;
  model?: string;
  provider?: string;
  threshold?: number;
}

const SYSTEM_PROMPT = `あなたは、議論の断片どうしの意味関係を判定する分類器です。中心ノード1件と候補ノード複数件が与えられます。各候補について、中心ノードとの関係を次から1つ選び、確信度(0–1)と20字程度の理由(日本語)を返してください。誰が書いたか・表現の巧拙は一切考慮せず、文の意味だけで一貫した基準で判定してください。
- supports（根拠づける）: 一方が他方の主張の根拠・証拠になる
- contradicts（対立する）: 両者が両立しにくい／矛盾する
- elaborates（具体化する）: 一方が他方をより具体的・詳細にした内容
- reframes（再枠組みする）: 一方が他方を別の観点から捉え直している（特に仮説に多い）
- none（関連なし）: 明確な関係がない
迷う場合・関係が弱い場合は none か低い確信度にし、無理に結ばないこと。
direction は、target→neighbor の向きが自然なら from_target_to_neighbor、逆なら from_neighbor_to_target、向きが無ければ undirected。
出力は必ず classify ツールで返すこと。`;

const TOOL = {
  name: 'classify',
  description: '各候補と中心ノードの意味関係を返す',
  input_schema: {
    type: 'object',
    properties: {
      links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            neighbor_id: { type: 'string' },
            relation: {
              type: 'string',
              enum: ['supports', 'contradicts', 'elaborates', 'reframes', 'none'],
            },
            direction: {
              type: 'string',
              enum: [
                'from_target_to_neighbor',
                'from_neighbor_to_target',
                'undirected',
              ],
            },
            confidence: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: ['neighbor_id', 'relation', 'direction', 'confidence', 'rationale'],
        },
      },
    },
    required: ['links'],
  },
};

const NODE_JA: Record<NodeType, string> = {
  fact: '事実',
  insight: '気づき',
  idea: 'アイデア',
  hypothesis: '仮説',
};
function fmt(n: CandidateNode): string {
  return `(${NODE_JA[n.type]}) [id:${n.id}] ${n.text}`;
}

export async function classify(
  body: ClassifyBody,
  env: ClassifyEnv,
): Promise<{ links: Link[] }> {
  const threshold = env.threshold ?? 0.6;
  if (!env.apiKey || !body?.target || !Array.isArray(body.candidates) || body.candidates.length === 0) {
    return { links: [] };
  }
  const provider = env.provider ?? 'anthropic';
  if (provider !== 'anthropic') return { links: [] };

  const model = env.model ?? 'claude-haiku-4-5';
  const userContent =
    `中心ノード:\n${fmt(body.target)}\n\n候補ノード:\n` +
    body.candidates.map(fmt).join('\n') +
    `\n\n各候補について relation/direction/confidence/rationale を判定してください。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'classify' },
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; input?: { links?: Link[] } }>;
  };
  const tu = (data.content ?? []).find((c) => c.type === 'tool_use');
  const links = tu?.input?.links ?? [];
  const ids = new Set(body.candidates.map((c) => c.id));
  const filtered = links.filter(
    (l) =>
      l &&
      l.relation !== 'none' &&
      typeof l.confidence === 'number' &&
      l.confidence >= threshold &&
      ids.has(l.neighbor_id),
  );
  return { links: filtered };
}
