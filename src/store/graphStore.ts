import { create } from 'zustand';
import type { EngineStatus } from '../lib/linkEngine/types';
import type { GraphEdge, GraphNode, PresenceUser } from '../types';

const HP_KEY = 'takaku_high_precision';

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  presence: PresenceUser[];
  myName: string;
  embById: Record<string, number[]>; // 端末内で算出した埋め込み（Phase 2）
  replayStep: number | null; // タイムライン再生：表示するノード数（null=全部）
  finalIdea: string; // FINAL IDEA本文
  engineStatus: EngineStatus | null; // 直近の ready / quota_exceeded（EngineStatusBar 表示用）
  preparingByTier: Record<string, number>; // tier -> DL進捗%（NLIとWebLLMが並行ロードしても両方表示）
  engineError: string | null; // ロード失敗した tier（'webllm' 等）
  highPrecision: boolean; // lite の高精度モード（WebLLM）オプトイン。localStorage 永続
  setMyName: (n: string) => void;
  setReplayStep: (n: number | null) => void;
  setFinalIdea: (s: string) => void;
  setEngineStatus: (s: EngineStatus | null) => void; // reducer: preparing/error は個別スロットへ振り分け
  setHighPrecision: (v: boolean) => void;
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
  engineStatus: null,
  preparingByTier: {},
  engineError: null,
  highPrecision:
    typeof localStorage !== 'undefined' && localStorage.getItem(HP_KEY) === '1',
  setMyName: (n) => set({ myName: n }),
  setReplayStep: (n) => set({ replayStep: n }),
  setFinalIdea: (s) => set({ finalIdea: s }),
  setEngineStatus: (s) =>
    set((st) => {
      if (s === null)
        return { engineStatus: null, preparingByTier: {}, engineError: null };
      if (s.state === 'preparing') {
        const next = { ...st.preparingByTier };
        if ((s.progress ?? 0) >= 100) delete next[s.tier];
        else next[s.tier] = s.progress ?? 0;
        return { preparingByTier: next };
      }
      if (s.state === 'error') {
        const next = { ...st.preparingByTier };
        delete next[s.tier];
        return { preparingByTier: next, engineError: s.tier };
      }
      // ready / quota_exceeded
      return { engineStatus: s };
    }),
  setHighPrecision: (v) => {
    try {
      localStorage.setItem(HP_KEY, v ? '1' : '0');
    } catch {
      /* private mode 等 */
    }
    set({ highPrecision: v });
  },
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
      engineStatus: null,
      preparingByTier: {},
      engineError: null,
    }),
}));
