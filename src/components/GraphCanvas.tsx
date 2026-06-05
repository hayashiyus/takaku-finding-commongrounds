import { useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import NodeCard from './NodeCard';
import { useGraphStore } from '../store/graphStore';
import { NODE_META, RELATION_META } from '../lib/relations';
import type { GraphNode, NodeType } from '../types';

const nodeTypes = { thought: NodeCard };

// Phase 0/1 用の素朴なバンド配置（型ごとに行、追加順に列）。Phase 4 で d3-force「整える」に置換。
const BAND_Y: Record<NodeType, number> = {
  hypothesis: 80,
  idea: 260,
  insight: 440,
  fact: 620,
};
function bandPosition(node: GraphNode, indexInType: number) {
  return { x: 80 + indexInType * 240, y: BAND_Y[node.type] };
}

export default function GraphCanvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const rfNodes: Node[] = useMemo(() => {
    const counters: Record<NodeType, number> = {
      fact: 0,
      insight: 0,
      idea: 0,
      hypothesis: 0,
    };
    return nodes.map((n) => {
      const pos =
        n.x != null && n.y != null
          ? { x: n.x, y: n.y }
          : bandPosition(n, counters[n.type]++);
      return {
        id: n.id,
        type: 'thought',
        position: pos,
        data: { type: n.type, text: n.text, author: n.author_name, isFinal: n.is_final },
      };
    });
  }, [nodes]);

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const meta = RELATION_META[e.relation];
        return {
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: meta.jaLabel,
          labelStyle: { fontSize: 11, fill: meta.color, fontWeight: 700 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          style: {
            stroke: meta.color,
            strokeWidth: meta.width,
            strokeDasharray: meta.dash,
            opacity: 0.5 + Math.min(0.5, e.confidence * 0.5),
          },
        };
      }),
    [edges],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: false }}
    >
      <Background color="#e3decf" gap={28} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => {
          const t = (n.data as { type?: NodeType }).type;
          return t ? NODE_META[t].color : '#999';
        }}
      />
      <Controls />
    </ReactFlow>
  );
}
