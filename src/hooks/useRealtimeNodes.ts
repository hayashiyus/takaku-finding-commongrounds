import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphNode } from '../types';

/** nodes の INSERT/UPDATE/DELETE を room_id で購読し store へ反映（SPEC §6） */
export function useRealtimeNodes(roomId: string) {
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const removeNode = useGraphStore((s) => s.removeNode);
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
      // DELETE はフィルタ付きチャネルに配信されない（Supabase仕様: old は主キーのみで
      // filter 照合不能）ため、フィルタ無しで購読する。全ルーム分届くが、
      // 未所持 id の remove は無害な no-op。
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'nodes' },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) removeNode(id);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [roomId, upsertNode, removeNode]);
}
