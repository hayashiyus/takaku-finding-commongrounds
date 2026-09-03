import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { GraphNode } from '../types';

// 受信イベントのまとめ反映ウィンドウ（ms）。
// 1イベント=1再レンダリングのままだと、20人同時投稿や「整える」の座標一括保存
// （per-row UPDATE が人数×件数ぶん届く）で受信側が件数ぶん再レンダリングしてしまう。
// この程度の遅延は人間には知覚されない。
const FLUSH_MS = 80;

type QueueItem =
  | { kind: 'upsert'; row: GraphNode }
  | { kind: 'delete'; id: string };

/** nodes の INSERT/UPDATE/DELETE を room_id で購読し、まとめて store へ反映（SPEC §6） */
export function useRealtimeNodes(roomId: string) {
  const queue = useRef<QueueItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const flush = () => {
      timer.current = null;
      const items = queue.current;
      if (items.length === 0) return;
      queue.current = [];
      const { upsertNodes, removeNode } = useGraphStore.getState();
      // 到着順を保ったまま、連続する upsert を1回の set() に束ねる
      let batch: GraphNode[] = [];
      for (const it of items) {
        if (it.kind === 'upsert') {
          batch.push(it.row);
        } else {
          if (batch.length > 0) {
            upsertNodes(batch);
            batch = [];
          }
          removeNode(it.id);
        }
      }
      if (batch.length > 0) upsertNodes(batch);
    };

    const enqueue = (item: QueueItem) => {
      queue.current.push(item);
      if (timer.current === null) timer.current = setTimeout(flush, FLUSH_MS);
    };

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
          if (n && n.id) enqueue({ kind: 'upsert', row: n });
        },
      )
      // DELETE はフィルタ付きチャネルに配信されない（Supabase仕様: old は主キーのみで
      // filter 照合不能）ため、フィルタ無しで購読する。全ルーム分届くが、
      // 未所持 id の remove は store 側で {} を返す no-op（再レンダリングも起きない）。
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'nodes' },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) enqueue({ kind: 'delete', id });
        },
      )
      .subscribe();

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      flush(); // 取りこぼし防止（ルーム移動時に未反映分を反映してから購読解除）
      void supabase?.removeChannel(ch);
    };
  }, [roomId]);
}
