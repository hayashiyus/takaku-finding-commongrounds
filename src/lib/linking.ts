// 候補選定（cosine top-k）＋ 型付き分類呼び出し ＋ フォールバック（SPEC §7.2/§7.3/§7.5）
import type {
  ClassifyRequest,
  ClassifyResponse,
  GraphNode,
  Relation,
} from '../types';

const TOPK = Number(import.meta.env.VITE_LINK_TOPK ?? 6);
const SIM_FLOOR = Number(import.meta.env.VITE_LINK_SIM_FLOOR ?? 0.3);
const LLM_ON =
  String(import.meta.env.VITE_FEATURE_LLM_LINKING ?? 'true') === 'true';

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Candidate {
  node: GraphNode;
  sim: number;
}

/** 新規ノードと同ルーム既存ノードの cosine 上位 k 件（フロア超）。自己は除外。 */
export function selectCandidates(
  target: GraphNode,
  all: GraphNode[],
): Candidate[] {
  if (!target.embedding) return [];
  const scored: Candidate[] = [];
  for (const n of all) {
    if (n.id === target.id || !n.embedding) continue;
    const sim = cosine(target.embedding, n.embedding);
    if (sim >= SIM_FLOOR) scored.push({ node: n, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, TOPK);
}

export interface ProposedEdge {
  source_id: string;
  target_id: string;
  relation: Relation;
  confidence: number;
  rationale?: string;
}

/** 候補を型付きエッジ案へ。LLM_ON=false のときは類似度フロア超を related に。 */
export async function classifyLinks(
  target: GraphNode,
  candidates: Candidate[],
): Promise<ProposedEdge[]> {
  if (candidates.length === 0) return [];

  if (!LLM_ON) {
    return candidates.map((c) => ({
      source_id: target.id,
      target_id: c.node.id,
      relation: 'related' as Relation,
      confidence: c.sim,
    }));
  }

  const body: ClassifyRequest = {
    target: { id: target.id, type: target.type, text: target.text },
    candidates: candidates.map((c) => ({
      id: c.node.id,
      type: c.node.type,
      text: c.node.text,
    })),
  };
  const res = await fetch('/api/classify-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`classify-links failed: ${res.status}`);
  const data = (await res.json()) as ClassifyResponse;

  const edges: ProposedEdge[] = [];
  for (const link of data.links) {
    if (link.relation === 'none') continue;
    let source_id = target.id;
    let target_id = link.neighbor_id;
    if (link.direction === 'from_neighbor_to_target') {
      source_id = link.neighbor_id;
      target_id = target.id;
    }
    edges.push({
      source_id,
      target_id,
      relation: link.relation,
      confidence: link.confidence,
      rationale: link.rationale,
    });
  }
  return edges;
}
