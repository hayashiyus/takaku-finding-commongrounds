// FINAL IDEA（SPEC §9.2）：rooms.final_idea を編集・保存し、核ノードを is_final で強調。
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import { NODE_META } from '../lib/relations';
import type { RoomMode, SynthesizeRequest, SynthesizeError } from '../types';

export default function FinalIdeaPanel({
  roomId,
  mode,
}: {
  roomId: string;
  mode?: RoomMode | null;
}) {
  const [open, setOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genDone, setGenDone] = useState(false);
  const finalIdea = useGraphStore((s) => s.finalIdea);
  const setFinalIdea = useGraphStore((s) => s.setFinalIdea);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const upsertNode = useGraphStore((s) => s.upsertNode);

  const save = async () => {
    if (supabase) {
      const { error } = await supabase
        .from('rooms')
        .update({ final_idea: finalIdea })
        .eq('id', roomId);
      setSaveState(error ? 'error' : 'ok');
    } else {
      setSaveState('ok');
    }
    window.setTimeout(() => setSaveState('idle'), 1500);
  };

  const generate = async () => {
    if (generating) return;
    const prev = finalIdea;
    if (nodes.length === 0) {
      setGenError('カードがまだありません。まずカードを投稿してください。');
      return;
    }
    if (finalIdea.trim()) {
      const ok = window.confirm('現在のFINAL IDEA下書きをAIの提案で置き換えます。よろしいですか？');
      if (!ok) return;
    }
    setGenerating(true);
    setGenError(null);
    setGenDone(false);
    setFinalIdea('');
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 240_000);
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          room_id: roomId,
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, text: n.text })),
          edges: edges.map((e) => ({ source_id: e.source_id, target_id: e.target_id, relation: e.relation })),
        } satisfies SynthesizeRequest),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const data = (await res.json().catch(() => null)) as SynthesizeError | null;
        setFinalIdea(prev);
        if (data?.error === 'quota_exceeded') {
          setGenError('このルームのAI呼び出し上限に達しました。');
        } else {
          setGenError('AI統合案の生成に失敗しました。サーバ設定またはAPIクレジットをご確認ください。');
        }
        return;
      }
      if (!res.ok || !res.body) {
        setFinalIdea(prev);
        setGenError('AI統合案の生成に失敗しました。サーバ設定またはAPIクレジットをご確認ください。');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setFinalIdea(acc);
      }
      acc += decoder.decode();
      if (!acc.trim()) {
        setFinalIdea(prev);
        setGenError('AIが提案を生成できませんでした。もう一度お試しください。');
      } else {
        setFinalIdea(acc);
        setGenDone(true);
      }
    } catch (e) {
      setFinalIdea(prev);
      if (e instanceof DOMException && e.name === 'AbortError') {
        setGenError('AI統合案の生成がタイムアウトしました。もう一度お試しください。');
      } else {
        setGenError('AI統合案の生成に失敗しました。サーバ設定またはAPIクレジットをご確認ください。');
      }
    } finally {
      setGenerating(false);
      window.clearTimeout(timer);
    }
  };

  const toggleFinal = async (id: string, cur: boolean) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    upsertNode({ ...n, is_final: !cur });
    if (supabase) {
      await supabase.from('nodes').update({ is_final: !cur }).eq('id', id);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setGenError(null); setGenDone(false); }}
        className="font-jp text-[12px] font-bold border rounded-full px-3 py-1 hover:opacity-70"
        style={{ borderColor: '#d97706', color: '#d97706' }}
      >
        ★ FINAL IDEA
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[min(560px,92vw)] max-h-[85vh] overflow-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                className="font-serif text-[18px] font-bold"
                style={{ color: '#d97706' }}
              >
                ★ FINAL IDEA（ひとつの像）
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-ink-soft text-[16px]"
              >
                ✕
              </button>
            </div>
            <p className="font-jp text-[12px] text-ink-soft mb-2">
              チームの最終アイデアを記述し、核となるノードを★で強調します。
            </p>
            {mode === 'pro' && (
              <>
                <p className="font-jp text-[11px] text-ink-soft mb-2">
                  AIが全カードを分析し、対立を止揚（アウフヘーベン）した統合案を提案します。
                </p>
                <button
                  onClick={generate}
                  disabled={generating}
                  className={`w-full font-jp text-[13px] font-bold rounded px-4 py-2 mb-2 border ${generating ? 'cursor-wait' : ''}`}
                  style={{
                    borderColor: '#d97706',
                    color: generating ? '#b45309' : '#d97706',
                    background: '#fffbeb',
                  }}
                >
                  {generating ? 'AIが統合案を作成中…' : '★ AIで統合案を生成'}
                </button>
                {genError && (
                  <div className="font-jp text-[11px] mb-2" style={{ color: '#dc2626' }}>
                    {genError}
                  </div>
                )}
                {genDone && (
                  <div className="font-jp text-[11px] mb-2" style={{ color: '#b45309' }}>
                    内容を確認・編集のうえ「保存」を押すと全員に共有されます。
                  </div>
                )}
              </>
            )}
            <textarea
              value={finalIdea}
              onChange={(e) => setFinalIdea(e.target.value)}
              readOnly={generating}
              rows={generating || finalIdea.length > 120 ? 8 : 3}
              placeholder="例：『育てる紙』── 使う人が完成させる再生厚紙キット"
              className="w-full border border-line rounded p-2 font-jp text-[14px] mb-2 outline-none focus:border-[#d97706]"
            />
            <button
              onClick={save}
              disabled={generating}
              className="font-jp text-[13px] font-bold text-white rounded px-4 py-1.5 mb-4 disabled:opacity-50"
              style={{ background: '#d97706' }}
            >
              {saveState === 'ok' ? '保存しました' : saveState === 'error' ? '保存に失敗（再試行）' : '保存'}
            </button>
            <div className="font-jp text-[12px] font-bold text-ink mb-1">
              FINAL に採用するノード
            </div>
            <div className="flex flex-col gap-1">
              {nodes.length === 0 && (
                <div className="font-jp text-[12px] text-ink-soft">
                  まだノードがありません。
                </div>
              )}
              {nodes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => toggleFinal(n.id, n.is_final)}
                  className="flex items-center gap-2 text-left border border-line rounded px-2 py-1 hover:bg-stone-50"
                >
                  <span style={{ color: n.is_final ? '#d97706' : '#ccc' }}>
                    {n.is_final ? '★' : '☆'}
                  </span>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-none"
                    style={{ background: NODE_META[n.type].color }}
                  />
                  <span className="font-jp text-[12px] text-ink truncate">
                    {n.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
