import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import type { PresenceUser } from '../types';

/** Supabase Presence でオンライン人数・表示名を共有（SPEC §6 / §9.4） */
export function usePresence(roomId: string, name: string) {
  const setPresence = useGraphStore((s) => s.setPresence);
  useEffect(() => {
    if (!supabase || !name) return;
    const ch = supabase.channel(`presence:${roomId}`, {
      config: { presence: { key: name } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const users: PresenceUser[] = [];
      for (const key of Object.keys(state)) {
        const metas = state[key] as unknown as PresenceUser[];
        if (metas[0]) users.push(metas[0]);
      }
      setPresence(users);
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.track({ name, online_at: new Date().toISOString() });
      }
    });
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [roomId, name, setPresence]);
}
