import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphEdge, GraphNode, Room } from '../types';

/** 入室・初期ノード/エッジ取得（SPEC §6） */
export function useRoom(roomId: string) {
  const setNodes = useGraphStore((s) => s.setNodes);
  const setEdges = useGraphStore((s) => s.setEdges);
  const setFinalIdea = useGraphStore((s) => s.setFinalIdea);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      await supabase.from('rooms').upsert({ id: roomId }, { onConflict: 'id' });
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
      const { data: nodes } = await supabase
        .from('nodes')
        .select('*')
        .eq('room_id', roomId)
        .order('seq', { ascending: true });
      const { data: edges } = await supabase
        .from('edges')
        .select('*')
        .eq('room_id', roomId);
      if (cancelled) return;
      const r = (roomRow as Room) ?? { id: roomId };
      setRoom(r);
      setFinalIdea(r.final_idea ?? '');
      // 取得失敗（data=null）時は既存のローカル状態を消さない（正規の空ルームは [] が返る）
      if (nodes) setNodes(nodes as GraphNode[]);
      if (edges) setEdges(edges as GraphEdge[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [roomId, setNodes, setEdges, setFinalIdea]);

  return { room, loading };
}
