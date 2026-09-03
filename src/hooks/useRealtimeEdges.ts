import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphEdge } from '../types';

// useRealtimeNodes と同じまとめ反映ウィンドウ。1カード投稿は最大 topk 本の
// エッジ upsert を全員へ配信するため、受信側の束ねが効く。
const FLUSH_MS = 80;

type QueueItem =
  | { kind: 'upsert'; row: GraphEdge }
  | { kind: 'delete'; id: string };

/** edges の INSERT/UPDATE/DELETE を room_id で購読し、まとめて store へ反映（SPEC §6） */
export function useRealtimeEdges(roomId: string) {
  const queue = useRef<QueueItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const flush = () => {
      timer.current = null;
      const items = queue.current;
      if (items.length === 0) return;
      queue.current = [];
      const { upsertEdges, removeEdge } = useGraphStore.getState();
      let batch: GraphEdge[] = [];
      for (const it of items) {
        if (it.kind === 'upsert') {
          batch.push(it.row);
        } else {
          if (batch.length > 0) {
            upsertEdges(batch);
            batch = [];
          }
          removeEdge(it.id);
        }
      }
      if (batch.length > 0) upsertEdges(batch);
    };

    const enqueue = (item: QueueItem) => {
      queue.current.push(item);
      if (timer.current === null) timer.current = setTimeout(flush, FLUSH_MS);
    };

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
          if (e && e.id) enqueue({ kind: 'upsert', row: e });
        },
      )
      // DELETE はフィルタ付きチャネルに配信されない（Supabase仕様: old は主キーのみで
      // filter 照合不能）ため、フィルタ無しで購読する。全ルーム分届くが、
      // 未所持 id の remove は store 側で {} を返す no-op（再レンダリングも起きない）。
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'edges' },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) enqueue({ kind: 'delete', id });
        },
      )
      .subscribe();

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      flush();
      void supabase?.removeChannel(ch);
    };
  }, [roomId]);
}
