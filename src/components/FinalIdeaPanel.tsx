// FINAL IDEA（SPEC §9.2）：rooms.final_idea を編集・保存し、核ノードを is_final で強調。
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useGraphStore } from '../store/graphStore';
import { NODE_META } from '../lib/relations';

export default function FinalIdeaPanel({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const finalIdea = useGraphStore((s) => s.finalIdea);
  const setFinalIdea = useGraphStore((s) => s.setFinalIdea);
  const nodes = useGraphStore((s) => s.nodes);
  const upsertNode = useGraphStore((s) => s.upsertNode);

  const save = async () => {
    if (supabase) {
      await supabase.from('rooms').update({ final_idea: finalIdea }).eq('id', roomId);
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
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
        onClick={() => setOpen(true)}
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
            <textarea
              value={finalIdea}
              onChange={(e) => setFinalIdea(e.target.value)}
              rows={3}
              placeholder="例：『育てる紙』── 使う人が完成させる再生厚紙キット"
              className="w-full border border-line rounded p-2 font-jp text-[14px] mb-2 outline-none focus:border-[#d97706]"
            />
            <button
              onClick={save}
              className="font-jp text-[13px] font-bold text-white rounded px-4 py-1.5 mb-4"
              style={{ background: '#d97706' }}
            >
              {saved ? '保存しました' : '保存'}
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
