import ExportPdfButton from './ExportPdfButton';
import FinalIdeaPanel from './FinalIdeaPanel';
import PresenceBar from './PresenceBar';
import ShareButton from './ShareButton';
import Timeline from './Timeline';

export default function TopBar({
  roomId,
  onTidy,
}: {
  roomId: string;
  onTidy?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-line bg-white/80 flex-wrap">
      <div className="font-mono text-[13px] font-bold tracking-wide">
        <span style={{ color: '#d97706' }}>◆</span> TAKAKU{' '}
        <span className="text-ink-soft font-jp">相関図ツール</span>
      </div>
      <span className="font-mono text-[11px] text-ink-soft">ROOM {roomId}</span>
      <span className="flex-1" />
      <button
        onClick={onTidy}
        className="font-jp text-[12px] font-bold border border-ink rounded-full px-3 py-1 hover:opacity-70"
      >
        整える
      </button>
      <Timeline />
      <FinalIdeaPanel />
      <ExportPdfButton />
      <ShareButton />
      <PresenceBar />
    </div>
  );
}
