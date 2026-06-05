import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphEdge } from '../types';

/** edges の INSERT/UPDATE を room_id で購読し store へ反映（SPEC §6） */
export function useRealtimeEdges(roomId: string) {
  const upsertEdge = useGraphStore((s) => s.upsertEdge);
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel(`edges:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'edges',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const e = payload.new as GraphEdge;
          if (e && e.id) upsertEdge(e);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [roomId, upsertEdge]);
}
