// lite Tier1: WebLLM（ブラウザ内小型LLM・WebGPU必須）による5種フル型付き判定。
// 完全オプトイン（DL≈1GB）。動的 import でメインバンドルに含めない。
// 失敗（未対応GPU/ロード失敗/JSON崩れ/タイムアウト）は呼び出し元（liteEngine）が NLI に降格する。
import type { GraphNode, LinkDirection, Relation } from '../../types';
import type { Candidate, ProposedEdge } from '../linking';

const MODEL =
  (import.meta.env.VITE_WEBLLM_MODEL as string | undefined) ||
  'Qwen3-1.7B-q4f16_1-MLC';
const TIMEOUT_MS = 30_000; // 端末内LLMは遅い端末で数十秒かかりうる
const THRESHOLD = 0.6; // pro の LINK_CONFIDENCE_THRESHOLD と同じ既定

// api/_classify.ts の SYSTEM_PROMPT と同趣旨（クライアント用に JSON 出力形式を明記）
const SYSTEM_PROMPT = `あなたは、議論の断片どうしの意味関係を判定する分類器です。中心ノード1件と候補ノード複数件が与えられます。各候補について、中心ノードとの関係を次から1つ選び、確信度(0-1)と20字程度の理由(日本語)を返してください。誰が書いたか・表現の巧拙は一切考慮せず、文の意味だけで一貫した基準で判定してください。
- supports（根拠づける）: 一方が他方の主張の根拠・証拠になる
- contradicts（対立する）: 両者が両立しにくい／矛盾する
- elaborates（具体化する）: 一方が他方をより具体的・詳細にした内容
- reframes（再枠組みする）: 一方が他方を別の観点から捉え直している
- none（関連なし）: 明確な関係がない
迷う場合・関係が弱い場合は none にし、無理に結ばないこと。
必ず次の形のJSONだけを出力すること:
{"links":[{"neighbor_id":"...","relation":"supports|contradicts|elaborates|reframes|none","direction":"from_target_to_neighbor|from_neighbor_to_target|undirected","confidence":0.0,"rationale":"..."}]}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

export function webllmSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function webllmReady(): boolean {
  return engine !== null;
}

// 進捗リスナー（nli.ts と同じ方式・module レベルで束ねる）
const progressListeners = new Set<(pct: number) => void>();
let bestProgress = 0;
function emitProgress(pct: number): void {
  bestProgress = Math.max(bestProgress, pct);
  for (const cb of progressListeners) cb(bestProgress);
}

/** WebLLM エンジンをロード（初回DL≈1GB→Cache APIキャッシュ）。進捗 0-100（100=完了）。 */
export async function loadWebllm(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (onProgress) {
    progressListeners.add(onProgress);
    if (bestProgress > 0) onProgress(bestProgress);
  }
  if (engine) {
    onProgress?.(100);
    return;
  }
  if (!webllmSupported()) throw new Error('WebGPU not available');
  if (!loadPromise) {
    loadPromise = import('@mlc-ai/web-llm')
      .then(async (webllm) => {
        const e = await webllm.CreateMLCEngine(MODEL, {
          initProgressCallback: (p) => {
            emitProgress(Math.min(99, Math.round((p.progress ?? 0) * 100)));
          },
        });
        engine = e;
        emitProgress(100);
      })
      .catch((err: unknown) => {
        loadPromise = null; // 失敗を永続キャッシュしない（トグル再ONで再試行可能）
        bestProgress = 0;
        throw err;
      });
  }
  await loadPromise;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error('webllm timeout')), ms),
    ),
  ]);
}

interface RawLink {
  neighbor_id?: string;
  relation?: string;
  direction?: string;
  confidence?: number;
  rationale?: string;
}

const RELATIONS = new Set(['supports', 'contradicts', 'elaborates', 'reframes']);
const NODE_JA: Record<string, string> = {
  fact: '事実',
  insight: '気づき',
  idea: 'アイデア',
  hypothesis: '仮説',
};

function parseJson(text: string): { links?: RawLink[] } {
  // Qwen3 の <think> ブロックや前置きテキストを防御的に除去
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no json in output');
  return JSON.parse(cleaned.slice(start, end + 1)) as { links?: RawLink[] };
}

/** WebLLM で target×候補を一括分類（pro と同じ契約）。失敗時は例外（上位で NLI 降格）。 */
export async function classifyLinksWebllm(
  target: GraphNode & { embedding: number[] },
  candidates: Candidate[],
): Promise<ProposedEdge[]> {
  if (!engine) throw new Error('webllm not loaded');
  const user =
    `中心ノード:\n(${NODE_JA[target.type]}) [id:${target.id}] ${target.text}\n\n候補ノード:\n` +
    candidates
      .map((c) => `(${NODE_JA[c.node.type]}) [id:${c.node.id}] ${c.node.text}`)
      .join('\n') +
    '\n\n各候補について relation/direction/confidence/rationale をJSONで返してください。 /no_think';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reply: any = await timeout<any>(
    engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
    TIMEOUT_MS,
  );
  const text: string = reply?.choices?.[0]?.message?.content ?? '';
  const data = parseJson(text);
  const ids = new Set(candidates.map((c) => c.node.id));

  const edges: ProposedEdge[] = [];
  for (const l of data.links ?? []) {
    if (!l || !l.neighbor_id || !ids.has(l.neighbor_id)) continue;
    if (!l.relation || !RELATIONS.has(l.relation)) continue; // none や不正値は結ばない
    const conf = typeof l.confidence === 'number' ? l.confidence : 0;
    if (conf < THRESHOLD) continue;
    let source_id = target.id;
    let target_id = l.neighbor_id;
    if ((l.direction as LinkDirection) === 'from_neighbor_to_target') {
      source_id = l.neighbor_id;
      target_id = target.id;
    }
    edges.push({
      source_id,
      target_id,
      relation: l.relation as Relation,
      confidence: conf,
      rationale: l.rationale,
    });
  }
  return edges;
}
