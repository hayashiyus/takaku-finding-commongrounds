// 候補選定（cosine top-k）と cosine 段の結線（SPEC §7.2/§7.5）
// 型付き分類（pro LLM / lite WebLLM / lite NLI）は src/lib/linkEngine/ が担当し、
// 本ファイルは「候補を選ぶ」「類似度だけで related を返す」純ロジックのみを持つ。
import type { GraphNode, Relation } from '../types';

const TOPK = Number(import.meta.env.VITE_LINK_TOPK ?? 6);
export const TOPK_LITE = Number(import.meta.env.VITE_LINK_TOPK_LITE ?? 3);
const SIM_FLOOR_RAW = Number(import.meta.env.VITE_LINK_SIM_FLOOR ?? 0.8);
// 分類器（LLM/NLI）が後段で判定する場合は recall 優先（フロアを 0.4 まで下げる）。
// cosine 単独で結線する場合はノイズ抑制のため env の高フロアをそのまま使う。
const FLOOR_WITH_CLASSIFIER = Math.min(SIM_FLOOR_RAW, 0.4);
export const RELATED_FLOOR = SIM_FLOOR_RAW; // neutral判定→related 降格時にも使う

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

export interface CandidateParams {
  /** 後段に型付き分類器がいるか（true=recall優先フロア / false=高フロア） */
  hasClassifier: boolean;
  topk: number;
}

export const DEFAULT_CANDIDATE_PARAMS: CandidateParams = {
  hasClassifier: false,
  topk: TOPK,
};

/** 新規ノードと同ルーム既存ノードの cosine 上位 k 件（フロア超）。自己は除外。 */
export function selectCandidates(
  target: GraphNode,
  all: GraphNode[],
  params: CandidateParams = DEFAULT_CANDIDATE_PARAMS,
): Candidate[] {
  if (!target.embedding) return [];
  const floor = params.hasClassifier ? FLOOR_WITH_CLASSIFIER : SIM_FLOOR_RAW;
  const scored: Candidate[] = [];
  for (const n of all) {
    if (n.id === target.id || !n.embedding) continue;
    const sim = cosine(target.embedding, n.embedding);
    if (sim >= floor) scored.push({ node: n, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, params.topk);
}

export interface ProposedEdge {
  source_id: string;
  target_id: string;
  relation: Relation;
  confidence: number;
  rationale?: string;
}

/**
 * cosine 段: RELATED_FLOOR 以上の候補のみ `related` として返す。
 * フロアをここで課すことで、分類器の失敗・quota 降格パス（recall優先 0.4 フロアで
 * 候補選定済み）から呼ばれても過剰結線しない（e5 の無関係≈0.79 問題対策）。
 * 正規の cosine 段（高フロアで選定済み）ではフィルタは実質 no-op。
 */
export function classifyLinksCosine(
  target: GraphNode,
  candidates: Candidate[],
): ProposedEdge[] {
  return candidates
    .filter((c) => c.sim >= RELATED_FLOOR)
    .map((c) => ({
      source_id: target.id,
      target_id: c.node.id,
      relation: 'related' as Relation,
      confidence: c.sim,
    }));
}
