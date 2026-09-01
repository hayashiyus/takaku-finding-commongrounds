// 「選択したカードとその関係先だけを、見やすく並べ直す」配置計算（アンケート要望#6）。
//
// D列:「タップした際に、関連付けされたものだけ、見やすいように並び替えされると良い」
// C列:「量が多くなると、関連付けされた箇所を探すのが大変」
//
// 全体レイアウト（elkLayout / layout）を走らせると画面全体が動いてしまうので、
// 選択ノードは動かさず、その近傍だけを周囲の円環へ移す部分レイアウトにする。
import { CARD_H_LAYOUT, CARD_W } from './cardMetrics';
import type { LayoutResult } from './layout';
import type { GraphNode } from '../types';

/** 中心カードは動かさず、近傍を円環状に配置する。戻り値は近傍ぶんのみ。 */
export function arrangeAround(
  center: GraphNode,
  neighbors: GraphNode[],
): LayoutResult[] {
  const n = neighbors.length;
  if (n === 0) return [];
  const cx = center.x ?? 0;
  const cy = center.y ?? 0;

  // 円周上でカードが重ならない半径を、枚数から決める（周長 ≥ 枚数 × カード幅＋余白）。
  const minR = Math.max(CARD_W, CARD_H_LAYOUT) * 0.95;
  const r = Math.max(minR, (n * (CARD_W + 40)) / (2 * Math.PI));

  return neighbors.map((nd, i) => {
    // 真上から時計回り。中心の真上に1枚目が来るので視線の起点が安定する。
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { id: nd.id, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}
