// 力学レイアウト（SPEC §7.6）。d3-forceで「散在→連結クラスタ」へ収束させる座標を計算。
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force';
import type { GraphEdge, GraphNode } from '../types';

export interface LayoutResult {
  id: string;
  x: number;
  y: number;
}

interface SimNode {
  id: string;
  x?: number;
  y?: number;
}

export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width = 1280,
  height = 800,
): LayoutResult[] {
  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x ?? undefined,
    y: n.y ?? undefined,
  }));
  const simLinks = edges.map((e) => ({
    source: e.source_id,
    target: e.target_id,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sim = forceSimulation(simNodes as any)
    .force('charge', forceManyBody().strength(-320))
    .force(
      'link',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      forceLink(simLinks as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .id((d: any) => d.id)
        .distance(150)
        .strength(0.5),
    )
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide(72))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  return simNodes.map((n) => ({
    id: n.id,
    x: n.x ?? width / 2,
    y: n.y ?? height / 2,
  }));
}
