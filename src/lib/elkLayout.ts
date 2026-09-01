// elkjs によるクラスタ配置＋交差最小化（「整える」の強化版）。
// 種類ごとに帯（partition）を作り、layered アルゴリズムで交差を減らし共通端点のエッジを束ねる。
// 動的 import でボタン初回押下時のみロード（初期バンドル非肥大）。失敗時は呼び出し側が d3-force にフォールバック。
import type { ElkNode } from 'elkjs';
import type { GraphEdge, GraphNode, NodeType } from '../types';
import type { LayoutResult } from './layout';
import { CARD_H_LAYOUT, CARD_W } from './cardMetrics';
import { cosine } from './linking';

// 既存 BAND_Y の並び（上→下）に一致: 仮説→アイデア→気づき→事実。
const TYPE_PARTITION: Record<NodeType, number> = {
  hypothesis: 0,
  idea: 1,
  insight: 2,
  fact: 3,
};
const BAND_TYPE_ORDER = ['hypothesis', 'idea', 'insight', 'fact'] as const;

// カード実寸と一致させる（cardMetrics）。以前は高さ 96 固定で、長文カード（実高 200〜400px）が
// 下の帯に食い込んでいた＝アンケート要望#1「文字が枠からはみ出す」の縦方向の原因。
const NODE_W = CARD_W;
const NODE_H = CARD_H_LAYOUT;

/**
 * 要望#4「案を整理して、同じ案が集まるように」
 * 帯（種類）の中の並び順を、埋め込みの類似度による貪欲な最近傍チェーンで決める。
 * 似ているカードが隣り合うので、カードを1枚も消さずに「同じ案が集まって見える」。
 * 埋め込み未算出のカードは末尾に置く。
 */
function orderBySimilarity(
  list: GraphNode[],
  embById: Record<string, number[]>,
): GraphNode[] {
  const withEmb = list.filter((n) => embById[n.id]);
  const without = list.filter((n) => !embById[n.id]);
  if (withEmb.length <= 2) return [...withEmb, ...without];
  const byId = new Map(withEmb.map((n) => [n.id, n] as const));
  const remaining = new Set(withEmb.map((n) => n.id));
  let cur = withEmb[0];
  remaining.delete(cur.id);
  const out: GraphNode[] = [cur];
  while (remaining.size > 0) {
    let best: string | null = null;
    let bestSim = -Infinity;
    for (const id of remaining) {
      const s = cosine(embById[cur.id], embById[id]);
      if (s > bestSim) {
        bestSim = s;
        best = id;
      }
    }
    if (!best) break;
    cur = byId.get(best)!;
    remaining.delete(best);
    out.push(cur);
  }
  return [...out, ...without];
}

export async function computeElkLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  embById: Record<string, number[]> = {},
): Promise<LayoutResult[]> {
  if (nodes.length === 0) return [];
  const ELKConstructor = (await import('elkjs/lib/elk.bundled.js')).default;
  const elk = new ELKConstructor();

  const ids = new Set(nodes.map((n) => n.id));
  // 帯ごとに similarity 順へ並べ替えてから ELK に渡す（要望#4）。
  // considerModelOrder により、交差最小化の同点時にこの入力順が採用される。
  const ordered = ([...BAND_TYPE_ORDER] as NodeType[]).flatMap((t) =>
    orderBySimilarity(
      nodes.filter((n) => n.type === t),
      embById,
    ),
  );
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.partitioning.activate': 'true', // 種類ごとの帯（クラスタ）を作る
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.mergeEdges': 'true', // 共通端点のエッジを束ねる
      // 交差最小化が同点のとき、入力順（＝類似度順）を採用させる（要望#4）
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.spacing.nodeNode': '52',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.edgeRouting': 'POLYLINE',
    },
    children: ordered.map((n) => ({
      id: n.id,
      width: NODE_W,
      height: NODE_H,
      layoutOptions: {
        'elk.partitioning.partition': String(TYPE_PARTITION[n.type] ?? 0),
      },
    })),
    // 端点が存在するエッジのみ（防御）。
    edges: edges
      .filter((e) => ids.has(e.source_id) && ids.has(e.target_id))
      .map((e) => ({
        id: e.id,
        sources: [e.source_id],
        targets: [e.target_id],
      })),
  };

  const res = await elk.layout(graph);
  return (res.children ?? []).map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
  }));
}
