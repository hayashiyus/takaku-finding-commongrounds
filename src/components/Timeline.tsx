// タイムライン再生（SPEC §9.1）：追加順にノードを出現させ、スクラブも可能。
import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '../store/graphStore';

export default function Timeline() {
  const total = useGraphStore((s) => s.nodes.length);
  const replayStep = useGraphStore((s) => s.replayStep);
  const setReplayStep = useGraphStore((s) => s.setReplayStep);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      const cur = useGraphStore.getState().replayStep ?? 0;
      if (cur >= total) {
        setPlaying(false);
        return;
      }
      setReplayStep(cur + 1);
    }, 600);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, total, setReplayStep]);

  const active = replayStep != null;

  if (!active) {
    return (
      <button
        onClick={() => {
          setReplayStep(0);
          setPlaying(true);
        }}
        disabled={total === 0}
        className="font-jp text-[12px] font-bold border border-ink rounded-full px-3 py-1 hover:opacity-70 disabled:opacity-40"
      >
        ▶ 再生
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setPlaying((p) => !p)}
        className="font-jp text-[12px] font-bold border border-ink rounded-full px-2.5 py-1 hover:opacity-70"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={total}
        value={replayStep ?? 0}
        onChange={(e) => {
          setPlaying(false);
          setReplayStep(Number(e.target.value));
        }}
        className="w-28 accent-ink"
      />
      <span className="font-mono text-[11px] text-ink-soft tabular-nums">
        {replayStep}/{total}
      </span>
      <button
        onClick={() => {
          setPlaying(false);
          setReplayStep(null);
        }}
        className="font-jp text-[11px] border border-line rounded-full px-2 py-0.5 text-ink-soft hover:opacity-70"
      >
        終了
      </button>
    </div>
  );
}
