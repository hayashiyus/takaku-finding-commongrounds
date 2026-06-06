import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import GraphCanvas from '../components/GraphCanvas';
import InputBar from '../components/InputBar';
import JoinDialog from '../components/JoinDialog';
import Legend from '../components/Legend';
import TopBar from '../components/TopBar';
import { useRoom } from '../hooks/useRoom';
import { useRealtimeNodes } from '../hooks/useRealtimeNodes';
import { useRealtimeEdges } from '../hooks/useRealtimeEdges';
import { usePresence } from '../hooks/usePresence';
import { computeLayout } from '../lib/layout';
import { embed, loadEmbedder } from '../lib/embeddings';
import { classifyLinks, selectCandidates } from '../lib/linking';
import { SEED_NODES } from '../lib/seed';
import { supabase, supabaseReady } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphEdge, GraphNode, NodeType } from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const toVec = (e: number[]) => `[${e.join(',')}]`;

export default function Room() {
  const { roomId = '' } = useParams();
  const myName = useGraphStore((s) => s.myName);
  const setMyName = useGraphStore((s) => s.setMyName);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const embById = useGraphStore((s) => s.embById);
  const setNodes = useGraphStore((s) => s.setNodes);
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const upsertEdge = useGraphStore((s) => s.upsertEdge);
  const setEmbedding = useGraphStore((s) => s.setEmbedding);

  const [embReady, setEmbReady] = useState(false);
  const embeddingBusy = useRef(false);

  useRoom(roomId);
  useRealtimeNodes(roomId);
  useRealtimeEdges(roomId);
  usePresence(roomId, myName);

  // バックエンド未設定時はローカルにシードを表示（§4 シード / オフライン確認用）
  useEffect(() => {
    if (!supabaseReady && useGraphStore.getState().nodes.length === 0) {
      setNodes(
        SEED_NODES.map((s, i) => ({
          id: `seed-${i}`,
          room_id: roomId,
          type: s.type,
          text: s.text,
          author_name: s.author_name,
          is_final: false,
          seq: i,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 2: 入室後に埋め込みモデルをロード（未ロードでも入力は可能）
  useEffect(() => {
    if (!myName) return;
    let on = true;
    loadEmbedder()
      .then(() => {
        if (on) setEmbReady(true);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [myName]);

  // Phase 2: 同期済みノードのうち埋め込み未算出のものを端末内で順次ベクトル化
  useEffect(() => {
    if (!embReady || embeddingBusy.current) return;
    const missing = nodes.filter((n) => !embById[n.id]);
    if (missing.length === 0) return;
    embeddingBusy.current = true;
    void (async () => {
      for (const n of missing) {
        try {
          const e = await embed(n.text);
          setEmbedding(n.id, e);
        } catch {
          /* ignore */
        }
      }
      embeddingBusy.current = false;
    })();
  }, [embReady, nodes, embById, setEmbedding]);

  if (!myName) return <JoinDialog onJoin={setMyName} />;

  const createNode = async (type: NodeType, text: string) => {
    const id = uid();
    const node: GraphNode = {
      id,
      room_id: roomId,
      type,
      text,
      author_name: myName,
      is_final: false,
    };
    upsertNode(node); // 楽観的更新（§6）
    if (supabase) {
      await supabase
        .from('nodes')
        .insert({ id, room_id: roomId, type, text, author_name: myName });
    }

    // Phase 2: 端末内で埋め込み生成（モデル未ロードなら自動でロード完了を待つ）
    let emb: number[];
    try {
      emb = await embed(text);
    } catch {
      return; // 埋め込み不可なら線は引かない（§7.2 候補ゼロ＝孤立を許容）
    }
    setEmbedding(id, emb);
    if (supabase) {
      // pgvector 保存（任意・best-effort / §5）
      void supabase
        .from('nodes')
        .update({ embedding: toVec(emb) })
        .eq('id', id)
        .then(
          () => {},
          () => {},
        );
    }

    // Phase 3（fallback）: 候補選定（cosine top-k）→ 型付きリンク（LLM無効時は related）
    const state = useGraphStore.getState();
    const all = state.nodes
      .map((n) => ({ ...n, embedding: state.embById[n.id] }))
      .filter((n): n is GraphNode & { embedding: number[] } =>
        Boolean(n.embedding) && n.id !== id,
      );
    const candidates = selectCandidates({ ...node, embedding: emb }, all);
    const existing = new Set(
      state.edges.flatMap((e) => [
        `${e.source_id}>${e.target_id}`,
        `${e.target_id}>${e.source_id}`,
      ]),
    );
    const proposed = await classifyLinks({ ...node, embedding: emb }, candidates);
    for (const p of proposed) {
      if (existing.has(`${p.source_id}>${p.target_id}`)) continue;
      const edge: GraphEdge = {
        id: uid(),
        room_id: roomId,
        source_id: p.source_id,
        target_id: p.target_id,
        relation: p.relation,
        confidence: p.confidence,
        rationale: p.rationale ?? null,
      };
      upsertEdge(edge);
      if (supabase) {
        void supabase
          .from('edges')
          .upsert(
            {
              id: edge.id,
              room_id: roomId,
              source_id: edge.source_id,
              target_id: edge.target_id,
              relation: edge.relation,
              confidence: edge.confidence,
              rationale: edge.rationale,
            },
            { onConflict: 'room_id,source_id,target_id' },
          )
          .then(
            () => {},
            () => {},
          );
      }
    }
  };

  const tidy = () => {
    const res = computeLayout(nodes, edges);
    const map = new Map(res.map((r) => [r.id, r] as const));
    setNodes(
      nodes.map((n) => {
        const p = map.get(n.id);
        return p ? { ...n, x: p.x, y: p.y } : n;
      }),
    );
  };

  // dev専用の検証フック（本番ビルドでは import.meta.env.DEV=false で除去される）
  if (import.meta.env.DEV) {
    (window as unknown as { __room?: unknown }).__room = {
      createNode,
      getState: useGraphStore.getState,
      embReady,
    };
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar roomId={roomId} onTidy={tidy} />
      {!supabaseReady && (
        <div className="bg-yellow-100 text-yellow-900 font-jp text-[12px] px-4 py-1.5 border-b border-yellow-200">
          Supabase 未設定：ローカル表示（同期なし）。`takaku-app/.env.local` に URL / ANON_KEY を設定すると複数端末同期が有効になります。
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <Legend />
        <GraphCanvas />
      </div>
      {!embReady && (
        <div className="bg-stone-100 text-ink-soft font-jp text-[11px] px-4 py-1 border-t border-line">
          AI（意味判定）準備中… 入力はそのまま可能です。
        </div>
      )}
      <InputBar onSubmit={createNode} />
    </div>
  );
}
