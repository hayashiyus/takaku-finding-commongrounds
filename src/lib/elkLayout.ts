// elkjs によるクラスタ配置＋交差最小化（「整える」の強化版）。
// 種類ごとに帯（partition）を作り、layered アルゴリズムで交差を減らし共通端点のエッジを束ねる。
// 動的 import でボタン初回押下時のみロード（初期バンドル非肥大）。失敗時は呼び出し側が d3-force にフォールバック。
import type { ElkNode } from 'elkjs';
import type { GraphEdge, GraphNode, NodeType } from '../types';
import type { LayoutResult } from './layout';

// 既存 BAND_Y の並び（上→下）に一致: 仮説→アイデア→気づき→事実。
const TYPE_PARTITION: Record<NodeType, number> = {
  hypothesis: 0,
  idea: 1,
  insight: 2,
  fact: 3,
};

const NODE_W = 210;
const NODE_H = 96;

export async function computeElkLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<LayoutResult[]> {
  if (nodes.length === 0) return [];
  const ELKConstructor = (await import('elkjs/lib/elk.bundled.js')).default;
  const elk = new ELKConstructor();

  const ids = new Set(nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.partitioning.activate': 'true', // 種類ごとの帯（クラスタ）を作る
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.mergeEdges': 'true', // 共通端点のエッジを束ねる
      'elk.spacing.nodeNode': '52',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.edgeRouting': 'POLYLINE',
    },
    children: nodes.map((n) => ({
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
