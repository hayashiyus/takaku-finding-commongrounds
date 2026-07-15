import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphEdge } from '../types';

/** edges の INSERT/UPDATE/DELETE を room_id で購読し store へ反映（SPEC §6） */
export function useRealtimeEdges(roomId: string) {
  const upsertEdge = useGraphStore((s) => s.upsertEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
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
      // DELETE はフィルタ付きチャネルに配信されない（Supabase仕様: old は主キーのみで
      // filter 照合不能）ため、フィルタ無しで購読する。全ルーム分届くが、
      // 未所持 id の remove は無害な no-op。
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'edges' },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) removeEdge(id);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [roomId, upsertEdge, removeEdge]);
}
