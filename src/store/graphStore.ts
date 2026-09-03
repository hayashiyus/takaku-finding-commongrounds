import { create } from 'zustand';
import type { EngineStatus } from '../lib/linkEngine/types';
import type { GraphEdge, GraphNode, PresenceUser } from '../types';

const HP_KEY = 'takaku_high_precision';
const CID_KEY = 'takaku_client_id'; // 端末固有ID（自分のカード判定）。永続。
const NAME_KEY = 'takaku_name'; // 表示名。永続すると再読込/再接続で入室ダイアログに戻らない。
const REL_KEY = 'takaku_show_related'; // 「関連」線の表示。既定は非表示（過密対策）。永続。

// アプリ内ブラウザ等では localStorage が存在してもアクセスで SecurityError を投げることがある
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function loadClientId(): string {
  try {
    const ex = localStorage.getItem(CID_KEY);
    if (ex) return ex;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem(CID_KEY, id);
    return id;
  } catch {
    // private mode 等で localStorage 不可 → セッション内のみ有効なIDにフォールバック
    return `c-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * ノードのマージ規則（upsertNode / upsertNodes 共通）。
 * 素朴なスプレッドだと、リモート UPDATE のペイロードに含まれる x=null / y=null が
 * 「整える」で決めたローカル座標を上書きし、誰かがカードを編集したり★を付けただけで
 * 全員の整列がバンド配置へ戻っていた（アンケート要望#2/#4/#6 の前提バグ）。
 * DB が実座標を持っているときだけ採用する。埋め込みも同様に温存する。
 */
function mergeNodes(cur: GraphNode[], incoming: GraphNode[]): GraphNode[] {
  const next = cur.slice();
  const idx = new Map(next.map((n, i) => [n.id, i] as const));
  for (const n of incoming) {
    const i = idx.get(n.id);
    if (i === undefined) {
      idx.set(n.id, next.length);
      next.push(n);
      continue;
    }
    const prev = next[i];
    const merged: GraphNode = { ...prev, ...n };
    if (n.x == null) merged.x = prev.x;
    if (n.y == null) merged.y = prev.y;
    if (n.embedding == null) merged.embedding = prev.embedding;
    next[i] = merged;
  }
  return next;
}

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  presence: PresenceUser[];
  myName: string;
  myId: string; // 端末固有ID（localStorage 永続・自分のカードの所有権判定）
  embById: Record<string, number[]>; // 端末内で算出した埋め込み（Phase 2）
  replayStep: number | null; // タイムライン再生：表示するノード数（null=全部）
  finalIdea: string; // FINAL IDEA本文
  engineStatus: EngineStatus | null; // 直近の ready / quota_exceeded（EngineStatusBar 表示用）
  preparingByTier: Record<string, number>; // tier -> DL進捗%（NLIとWebLLMが並行ロードしても両方表示）
  engineError: string | null; // ロード失敗した tier（'webllm' 等）
  highPrecision: boolean; // lite の高精度モード（WebLLM）オプトイン。localStorage 永続
  showRelated: boolean; // 「関連」線を表示するか（既定 false=非表示）。localStorage 永続
  setMyName: (n: string) => void;
  setReplayStep: (n: number | null) => void;
  setFinalIdea: (s: string) => void;
  setEngineStatus: (s: EngineStatus | null) => void; // reducer: preparing/error は個別スロットへ振り分け
  setHighPrecision: (v: boolean) => void;
  setShowRelated: (v: boolean) => void;
  setNodes: (n: GraphNode[]) => void;
  setEdges: (e: GraphEdge[]) => void;
  upsertNode: (n: GraphNode) => void;
  upsertNodes: (n: GraphNode[]) => void; // Realtime のまとめ反映（1回の set() で複数件）
  setNodePosition: (id: string, x: number, y: number) => void; // ドラッグ確定時の座標反映
  applyPositions: (list: { id: string; x: number; y: number }[]) => void; // レイアウト結果の一括反映
  upsertEdge: (e: GraphEdge) => void;
  upsertEdges: (e: GraphEdge[]) => void; // 複数エッジを1回の set() で反映（再描画を1回に抑える）
  editingNodeId: string | null; // 編集中カード（仮想化の一時停止に使う。下書き喪失防止）
  setEditingNodeId: (id: string | null) => void;
  removeNode: (id: string) => void; // ノード＋接続エッジをストアから除去（削除・リモートDELETE反映）
  removeEdge: (id: string) => void; // エッジ1本を除去（リモートDELETE反映）
  removeEdgesByNode: (nodeId: string) => void; // 接続エッジのみ除去（編集の線引き直し）
  setEmbedding: (id: string, emb: number[]) => void;
  setPresence: (p: PresenceUser[]) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  presence: [],
  myName: loadName(),
  myId: loadClientId(),
  embById: {},
  replayStep: null,
  finalIdea: '',
  engineStatus: null,
  preparingByTier: {},
  engineError: null,
  highPrecision: readFlag(HP_KEY),
  showRelated: readFlag(REL_KEY),
  setMyName: (n) => {
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* private mode 等 */
    }
    set({ myName: n });
  },
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
  setShowRelated: (v) => {
    try {
      localStorage.setItem(REL_KEY, v ? '1' : '0');
    } catch {
      /* private mode 等 */
    }
    set({ showRelated: v });
  },
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  upsertNode: (n) =>
    set((s) => ({ nodes: mergeNodes(s.nodes, [n]) })),
  // Realtime の受信をまとめて1回の set() で反映する（イベント数ぶんの再レンダリングを防ぐ）
  upsertNodes: (list) =>
    set((s) => (list.length === 0 ? {} : { nodes: mergeNodes(s.nodes, list) })),
  setNodePosition: (id, x, y) =>
    set((s) => {
      const i = s.nodes.findIndex((n) => n.id === id);
      if (i === -1) return {};
      const next = s.nodes.slice();
      next[i] = { ...next[i], x, y };
      return { nodes: next };
    }),
  // レイアウト結果（整える・関連だけ集める・ドラッグ）の一括反映。
  // getState() スナップショットからの setNodes 全置換は、スナップショットと set の間に
  // 届いたリモート挿入を消すレースがあるため、必ず関数型 set で現在値に対して適用する。
  applyPositions: (list) =>
    set((s) => {
      if (list.length === 0) return {};
      const map = new Map(list.map((r) => [r.id, r] as const));
      let changed = false;
      const next = s.nodes.map((n) => {
        const p = map.get(n.id);
        if (!p) return n;
        changed = true;
        return { ...n, x: p.x, y: p.y };
      });
      return changed ? { nodes: next } : {};
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
  // 要望#3: 1カード投稿で提案エッジを1本ずつ upsert していたため、
  // 「1(node) + k(edges)」回の全再描画が全参加者の端末で起きていた。まとめて1回にする。
  upsertEdges: (list) =>
    set((s) => {
      if (list.length === 0) return {};
      const next = s.edges.slice();
      for (const e of list) {
        const i = next.findIndex(
          (x) =>
            x.id === e.id ||
            (x.source_id === e.source_id && x.target_id === e.target_id),
        );
        if (i === -1) next.push(e);
        else next[i] = { ...next[i], ...e };
      }
      return { edges: next };
    }),
  // DELETE の Realtime 購読はフィルタ無し（Supabase 仕様）のため、他ルームの削除イベントも
  // ここへ届く。対象が store に無いときは新しい配列を作らず {} を返し、無関係な
  // 再レンダリングを起こさない（以前は no-op でも全購読者が再レンダリングしていた）。
  removeNode: (id) =>
    set((s) => {
      const hasNode = s.nodes.some((n) => n.id === id);
      const hasEdge = s.edges.some(
        (e) => e.source_id === id || e.target_id === id,
      );
      if (!hasNode && !hasEdge) return {};
      return {
        nodes: hasNode ? s.nodes.filter((n) => n.id !== id) : s.nodes,
        // 接続エッジも同時に除去（DBのカスケード削除イベントに依存せずローカルを整合）
        edges: hasEdge
          ? s.edges.filter((e) => e.source_id !== id && e.target_id !== id)
          : s.edges,
      };
    }),
  removeEdge: (id) =>
    set((s) =>
      s.edges.some((e) => e.id === id)
        ? { edges: s.edges.filter((e) => e.id !== id) }
        : {},
    ),
  removeEdgesByNode: (nodeId) =>
    set((s) =>
      s.edges.some((e) => e.source_id === nodeId || e.target_id === nodeId)
        ? {
            edges: s.edges.filter(
              (e) => e.source_id !== nodeId && e.target_id !== nodeId,
            ),
          }
        : {},
    ),
  editingNodeId: null,
  setEditingNodeId: (id) => set({ editingNodeId: id }),
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
