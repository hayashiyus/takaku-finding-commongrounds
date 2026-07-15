import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '../store/graphStore';

export default function PresenceBar() {
  const presence = useGraphStore((s) => s.presence);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 whitespace-nowrap font-mono text-[12px] text-ink-soft hover:opacity-70"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-green-700">●</span>
        <span className="font-bold">{presence.length} ONLINE</span>
        <span aria-hidden="true" className="text-[10px]">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-56 min-w-[160px] overflow-y-auto rounded-md border border-line bg-white px-3 py-2 text-ink-soft shadow-md">
          <div className="font-jp text-[11px] font-bold">
            参加中（{presence.length}人）
          </div>
          <div className="mt-1 space-y-1">
            {presence.length === 0 ? (
              <div className="font-jp text-[12px]">参加者なし</div>
            ) : (
              presence.map((participant) => (
                <div
                  key={`${participant.name}-${participant.online_at}`}
                  className="flex items-center gap-2 whitespace-nowrap font-jp text-[12px]"
                >
                  <span className="text-[8px] text-green-700">●</span>
                  <span>{participant.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
