// 関係判定エンジンの状態表示＋lite の高精度モード（WebLLM）トグル＋pro の quota バナー。
// ready 行と DL 進捗（NLI/WebLLM 並行）を併記し、単一スロットの奪い合いを避ける。
import { webllmSupported } from '../lib/linkEngine/webllm';
import { useGraphStore } from '../store/graphStore';
import type { RoomMode } from '../types';

const TIER_LABEL: Record<string, string> = {
  pro: 'Claude（クラウドAI）',
  webllm: '高精度（端末内LLM）',
  nli: '軽量分類（端末内NLI）',
  cosine: '類似度のみ',
};
const PREP_LABEL: Record<string, string> = {
  webllm: '高精度モデル',
  nli: '軽量分類モデル',
};

export default function EngineStatusBar({
  mode,
  embReady,
}: {
  mode: RoomMode;
  embReady: boolean;
}) {
  const status = useGraphStore((s) => s.engineStatus);
  const preparing = useGraphStore((s) => s.preparingByTier);
  const engineError = useGraphStore((s) => s.engineError);
  const highPrecision = useGraphStore((s) => s.highPrecision);
  const setHighPrecision = useGraphStore((s) => s.setHighPrecision);

  // pro quota 超過は最優先の警告
  if (status?.state === 'quota_exceeded') {
    return (
      <div className="bg-yellow-100 text-yellow-900 font-jp text-[12px] px-4 py-1.5 border-t border-yellow-200">
        このルームのAI判定上限に達しました。以降は類似度のみで結線します。
      </div>
    );
  }

  const parts: string[] = [];
  if (!embReady) parts.push('埋め込み準備中…（入力はそのまま可能です）');
  if (status?.state === 'ready') {
    parts.push(`関係判定: ${TIER_LABEL[status.tier] ?? status.tier}`);
  }
  for (const [tier, pct] of Object.entries(preparing)) {
    parts.push(`${PREP_LABEL[tier] ?? tier}を取得中… ${pct}%`);
  }
  if (engineError === 'webllm') {
    parts.push('高精度モデルの読み込みに失敗しました（軽量分類で継続）');
  } else if (engineError === 'nli') {
    parts.push('軽量分類モデルの読み込みに失敗しました（類似度のみで継続）');
  }

  const showHpToggle = mode === 'lite' && webllmSupported();

  if (parts.length === 0 && !showHpToggle) return null;

  return (
    <div className="flex items-center gap-3 bg-stone-100 text-ink-soft font-jp text-[11px] px-4 py-1 border-t border-line">
      <span className="flex-1 truncate">{parts.join('　·　')}</span>
      {showHpToggle && (
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap shrink-0"
          title="端末内LLM（WebLLM）で5種の関係を高精度判定します。初回のみ約1GBをダウンロードし、端末にキャッシュされます。"
        >
          <input
            type="checkbox"
            checked={highPrecision}
            onChange={(e) => setHighPrecision(e.target.checked)}
            className="accent-emerald-700"
          />
          高精度モード
          <span className="hidden sm:inline">（端末内LLM・初回約1GB）</span>
        </label>
      )}
    </div>
  );
}
