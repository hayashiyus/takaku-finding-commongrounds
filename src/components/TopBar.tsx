import { useEffect, useRef, useState } from 'react';
import ExportPdfButton from './ExportPdfButton';
import FinalIdeaPanel from './FinalIdeaPanel';
import PresenceBar from './PresenceBar';
import ShareButton from './ShareButton';
import Timeline from './Timeline';
import type { RoomMode } from '../types';

export default function TopBar({
  roomId,
  mode,
  onTidy,
  tidying,
}: {
  roomId: string;
  mode?: RoomMode | null;
  onTidy?: () => void;
  tidying?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div className="relative flex items-center gap-3 px-4 py-2 border-b border-line bg-white/80 flex-wrap">
      <div className="font-mono text-[13px] font-bold tracking-wide">
        <span style={{ color: '#d97706' }}>◆</span> TAKAKU{' '}
        <span className="hidden sm:inline text-ink-soft font-jp">相関図ツール</span>
      </div>
      <span className="font-mono text-[11px] text-ink-soft truncate max-w-[80px] sm:max-w-none">
        ROOM {roomId}
      </span>
      {mode && (
        <span
          className="font-mono text-[10px] font-bold rounded px-1.5 py-0.5"
          style={
            mode === 'pro'
              ? { background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b' }
              : { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }
          }
          title={
            mode === 'pro'
              ? '本番LLM版: クラウドAI (Claude) が関係を判定'
              : '簡易版: ブラウザ内AIのみ（APIコストゼロ）'
          }
        >
          {mode === 'pro' ? 'PRO' : 'LITE'}
        </span>
      )}
      <span className="flex-1" />
      <div ref={menuRef} className="contents">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="sm:hidden font-jp text-[13px] font-bold border border-ink rounded-full px-4 min-h-11"
        >
          メニュー {open ? '▴' : '▾'}
        </button>
        <div
          className={`${open ? 'flex' : 'hidden'} absolute right-2 top-full mt-1 z-40 flex-col items-stretch gap-2 bg-white border border-line rounded-md shadow-md p-3 min-w-[200px] [&>button]:min-h-11 sm:[&>button]:min-h-0 sm:flex sm:static sm:flex-row sm:items-center sm:gap-3 sm:bg-transparent sm:border-0 sm:shadow-none sm:p-0 sm:mt-0 sm:min-w-0`}
        >
          <button
            onClick={onTidy}
            disabled={tidying}
            className="font-jp text-[12px] font-bold border border-ink rounded-full px-3 py-1 hover:opacity-70 disabled:opacity-50 disabled:cursor-wait"
          >
            {tidying ? '整える中…' : '整える'}
          </button>
          <Timeline />
          <FinalIdeaPanel roomId={roomId} />
          <ExportPdfButton roomId={roomId} />
          <ShareButton />
        </div>
      </div>
      <PresenceBar />
    </div>
  );
}
