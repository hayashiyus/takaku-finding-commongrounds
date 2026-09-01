// 「選択したカードと、線でつながっている相手」を求める共通ロジック。
//
// もともと GraphCanvas の中だけにあったが、アンケート要望#2/#5/#6 で
// キャンバス（視点を寄せる）とカード送りビュー（スマホ）の両方から必要になったため切り出した。
import type { GraphEdge } from '../types';

/**
 * selected とその近傍のID集合（selected 自身を含む）。
 * 画面に描かれていない「関連」線は近傍に数えない — ハイライトと表示の整合を保つため。
 */
export function neighborIds(
  selected: string,
  edges: GraphEdge[],
  showRelated: boolean,
): Set<string> {
  const set = new Set<string>([selected]);
  for (const e of edges) {
    if (e.relation === 'related' && !showRelated) continue;
    if (e.source_id === selected) set.add(e.target_id);
    if (e.target_id === selected) set.add(e.source_id);
  }
  return set;
}

/** selected に接続しているエッジのみ（カード送りビューで関係の種類を並べるのに使う）。 */
export function incidentEdges(
  selected: string,
  edges: GraphEdge[],
  showRelated: boolean,
): GraphEdge[] {
  return edges.filter((e) => {
    if (e.relation === 'related' && !showRelated) return false;
    return e.source_id === selected || e.target_id === selected;
  });
}
