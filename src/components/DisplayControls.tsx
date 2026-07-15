// キャンバス左上の表示コントロール（過密対策）。当面は「関連線を表示」トグル。
// モバイルでも常時表示（Legend は sm 以上のみだが、これは常時）。
import { useGraphStore } from '../store/graphStore';

export default function DisplayControls() {
  const showRelated = useGraphStore((s) => s.showRelated);
  const setShowRelated = useGraphStore((s) => s.setShowRelated);

  return (
    <div className="absolute top-3 left-3 z-10 bg-white/92 border border-line rounded-md px-3 py-2.5 sm:px-2.5 sm:py-1.5 shadow-sm">
      <label
        className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap font-jp text-[12px] sm:text-[11px] text-ink"
        title="「関連」線（弱いつながり）を表示します。既定では非表示にして線の重なりを抑えています。"
      >
        <input
          type="checkbox"
          checked={showRelated}
          onChange={(e) => setShowRelated(e.target.checked)}
          className="accent-stone-500 w-4 h-4 sm:w-auto sm:h-auto"
        />
        関連線を表示
      </label>
    </div>
  );
}
