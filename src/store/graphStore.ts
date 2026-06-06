import { create } from 'zustand';
import type { GraphEdge, GraphNode, PresenceUser } from '../types';

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  presence: PresenceUser[];
  myName: string;
  embById: Record<string, number[]>; // 端末内で算出した埋め込み（Phase 2）
  replayStep: number | null; // タイムライン再生：表示するノード数（null=全部）
  finalIdea: string; // FINAL IDEA本文
  setMyName: (n: string) => void;
  setReplayStep: (n: number | null) => void;
  setFinalIdea: (s: string) => void;
  setNodes: (n: GraphNode[]) => void;
  setEdges: (e: GraphEdge[]) => void;
  upsertNode: (n: GraphNode) => void;
  upsertEdge: (e: GraphEdge) => void;
  setEmbedding: (id: string, emb: number[]) => void;
  setPresence: (p: PresenceUser[]) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  presence: [],
  myName: '',
  embById: {},
  replayStep: null,
  finalIdea: '',
  setMyName: (n) => set({ myName: n }),
  setReplayStep: (n) => set({ replayStep: n }),
  setFinalIdea: (s) => set({ finalIdea: s }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  upsertNode: (n) =>
    set((s) => {
      const i = s.nodes.findIndex((x) => x.id === n.id);
      if (i === -1) return { nodes: [...s.nodes, n] };
      const next = s.nodes.slice();
      next[i] = { ...next[i], ...n };
      return { nodes: next };
    }),
  upsertEdge: (e) =>
    set((s) => {
      const i = s.edges.findIndex(
        (x) =>
          x.id === e.id ||
          (x.source_id === e.source_id && x.target_id === e.target_id),
      );
      if (i === -1) return { edges: [...s.edges, e] };
      const next = s.edges.slice();
      next[i] = { ...next[i], ...e };
      return { edges: next };
    }),
  setEmbedding: (id, emb) =>
    set((s) => ({ embById: { ...s.embById, [id]: emb } })),
  setPresence: (presence) => set({ presence }),
  reset: () =>
    set({
      nodes: [],
      edges: [],
      presence: [],
      embById: {},
      replayStep: null,
      finalIdea: '',
    }),
}));
