import { useEffect } from 'react';
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
import { SEED_NODES } from '../lib/seed';
import { supabase, supabaseReady } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphNode, NodeType } from '../types';

export default function Room() {
  const { roomId = '' } = useParams();
  const myName = useGraphStore((s) => s.myName);
  const setMyName = useGraphStore((s) => s.setMyName);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const setNodes = useGraphStore((s) => s.setNodes);
  const upsertNode = useGraphStore((s) => s.upsertNode);

  useRoom(roomId);
  useRealtimeNodes(roomId);
  useRealtimeEdges(roomId);
  usePresence(roomId, myName);

  // バックエンド未設定時はローカルにシードを表示（Phase 0 の動作確認用 / §4 シード）
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
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!myName) return <JoinDialog onJoin={setMyName} />;

  const createNode = async (type: NodeType, text: string) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}`;
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
      // 埋め込み生成・型付きリンクは Phase 2 / Phase 3 で追加する
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
      <InputBar onSubmit={createNode} />
    </div>
  );
}
