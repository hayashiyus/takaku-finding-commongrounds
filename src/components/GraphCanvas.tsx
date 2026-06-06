import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import type {
  Edge,
  Node,
  NodeMouseHandler,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import NodeCard from './NodeCard';
import { useGraphStore } from '../store/graphStore';
import { NODE_META, RELATION_META } from '../lib/relations';
import type { GraphNode, NodeType } from '../types';

const nodeTypes = { thought: NodeCard };

// 位置未確定ノードの素朴なバンド配置（「整える」前の初期配置）。
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
  const replayStep = useGraphStore((s) => s.replayStep);
  const [selected, setSelected] = useState<string | null>(null);
  const rf = useRef<ReactFlowInstance | null>(null);

  // タイムライン再生：先頭から replayStep 件のみ表示（null=全件）。位置は保持し hidden で制御。
  const visibleIds = useMemo(
    () =>
      replayStep == null
        ? null
        : new Set(nodes.slice(0, replayStep).map((n) => n.id)),
    [nodes, replayStep],
  );

  // 近傍ハイライト用（選択ノードと、線でつながる相手）
  const neighbors = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of edges) {
      if (e.source_id === selected) set.add(e.target_id);
      if (e.target_id === selected) set.add(e.source_id);
    }
    return set;
  }, [selected, edges]);

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
        hidden: visibleIds ? !visibleIds.has(n.id) : false,
        data: {
          type: n.type,
          text: n.text,
          author: n.author_name,
          isFinal: n.is_final,
          dimmed: neighbors ? !neighbors.has(n.id) : false,
        },
      };
    });
  }, [nodes, neighbors, visibleIds]);

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const meta = RELATION_META[e.relation];
        const touches = selected
          ? e.source_id === selected || e.target_id === selected
          : true;
        const baseOp = 0.5 + Math.min(0.5, e.confidence * 0.5);
        return {
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: meta.jaLabel,
          hidden: visibleIds
            ? !(visibleIds.has(e.source_id) && visibleIds.has(e.target_id))
            : false,
          labelStyle: { fontSize: 11, fill: meta.color, fontWeight: 700 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          animated: selected ? touches : false,
          style: {
            stroke: meta.color,
            strokeWidth: touches ? meta.width + 0.6 : meta.width,
            strokeDasharray: meta.dash,
            opacity: selected ? (touches ? 0.95 : 0.12) : baseOp,
          },
        };
      }),
    [edges, selected, visibleIds],
  );

  // ノード追加・「整える」時に自動で全体表示へ（投影で見切れない / fitView再適用）
  useEffect(() => {
    const inst = rf.current;
    if (!inst) return;
    const t = setTimeout(
      () => inst.fitView({ duration: 550, padding: 0.2, maxZoom: 1.2 }),
      320,
    );
    return () => clearTimeout(t);
  }, [nodes]);

  // 画面サイズ変更（スマホ↔投影、回転）で全体表示を保つ
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(
        () => rf.current?.fitView({ duration: 300, padding: 0.2, maxZoom: 1.2 }),
        150,
      );
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelected((p) => (p === node.id ? null : node.id));
  }, []);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onInit={(inst) => {
        rf.current = inst;
      }}
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelected(null)}
      fitView
      minZoom={0.2}
      maxZoom={2}
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
