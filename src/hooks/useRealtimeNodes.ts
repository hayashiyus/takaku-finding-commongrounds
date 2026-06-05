import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphNode } from '../types';

/** nodes の INSERT/UPDATE を room_id で購読し store へ反映（SPEC §6） */
export function useRealtimeNodes(roomId: string) {
  const upsertNode = useGraphStore((s) => s.upsertNode);
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel(`nodes:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nodes',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const n = payload.new as GraphNode;
          if (n && n.id) upsertNode(n);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [roomId, upsertNode]);
}
