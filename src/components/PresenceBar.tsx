import { useGraphStore } from '../store/graphStore';

export default function PresenceBar() {
  const presence = useGraphStore((s) => s.presence);
  return (
    <div className="flex items-center gap-2 font-mono text-[12px] text-ink-soft">
      <span className="text-green-700">●</span>
      <span className="font-bold">{presence.length} ONLINE</span>
      {presence.length > 0 && (
        <span className="text-ink-soft/70 font-jp">
          {presence.map((p) => p.name).join('・')}
        </span>
      )}
    </div>
  );
}
