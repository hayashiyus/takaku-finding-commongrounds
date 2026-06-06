import {
  NODE_META,
  NODE_TYPE_ORDER,
  RELATION_META,
  RELATION_ORDER,
} from '../lib/relations';

export default function Legend() {
  return (
    <div className="hidden sm:block absolute top-3 right-3 z-10 bg-white/92 border border-line rounded-md px-3 py-2 shadow-sm text-[11px] font-jp">
      <div className="font-bold text-ink mb-1">ノードの種類</div>
      <div className="flex flex-col gap-1 mb-2">
        {NODE_TYPE_ORDER.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: NODE_META[k].color }}
            />
            {NODE_META[k].jaLabel}
          </div>
        ))}
      </div>
      <div className="font-bold text-ink mb-1">関係の線</div>
      <div className="flex flex-col gap-1">
        {RELATION_ORDER.map((r) => {
          const m = RELATION_META[r];
          return (
            <div key={r} className="flex items-center gap-2">
              <svg width="22" height="8">
                <line
                  x1="0"
                  y1="4"
                  x2="22"
                  y2="4"
                  stroke={m.color}
                  strokeWidth={m.width}
                  strokeDasharray={m.dash}
                />
              </svg>
              {m.jaLabel}
            </div>
          );
        })}
      </div>
    </div>
  );
}
