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
}: {
  roomId: string;
  mode?: RoomMode | null;
  onTidy?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-line bg-white/80 flex-wrap">
      <div className="font-mono text-[13px] font-bold tracking-wide">
        <span style={{ color: '#d97706' }}>◆</span> TAKAKU{' '}
        <span className="text-ink-soft font-jp">相関図ツール</span>
      </div>
      <span className="font-mono text-[11px] text-ink-soft">ROOM {roomId}</span>
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
      <button
        onClick={onTidy}
        className="font-jp text-[12px] font-bold border border-ink rounded-full px-3 py-1 hover:opacity-70"
      >
        整える
      </button>
      <Timeline />
      <FinalIdeaPanel roomId={roomId} />
      <ExportPdfButton roomId={roomId} />
      <ShareButton />
      <PresenceBar />
    </div>
  );
}
