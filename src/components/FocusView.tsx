// カード送りビュー（アンケート要望#5・2026-08-30）。
//
// D列:「スマホでも見やすいように意見ごとに画面が変わるような仕組みがあったらいいなと思った」
// C列:「意見が多くなると線も多くなり見にくくなった。特にスマホだと扱いづらく感じた」
//
// 相関図は俯瞰には向くが、狭い画面では線が重なって読めない。ここでは
// 「1件の意見と、それにつながっている意見だけ」を縦に並べて1件ずつ送る。
// 関係の種類（根拠づける／対立する…）は色と言葉で明示し、線を追わなくても関係が読める。
import { useMemo, useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { NODE_META, NODE_TYPE_ORDER, RELATION_META } from '../lib/relations';
import { incidentEdges } from '../lib/neighbors';
import { NODE_TEXT_MAX, validateNodeText } from '../lib/validation';
import type { NodeType } from '../types';

export default function FocusView({
  onEditNode,
  onDeleteNode,
}: {
  onEditNode?: (id: string, text: string, type: NodeType) => void;
  onDeleteNode?: (id: string) => void;
}) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const showRelated = useGraphStore((s) => s.showRelated);
  const [idx, setIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  // 編集状態はカードIDに紐づける。カード送りや他人の削除で表示中カードが変わったら
  // 自動的に閲覧へ戻る（別カードに下書きを誤保存しない）。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState<NodeType>('fact');
  const [err, setErr] = useState<string | null>(null);

  // カードが削除されて件数が減ったときは、描画時にクランプする
  // （effect で setState すると余計な再レンダリングが1回増える）。
  const safeIdx = Math.min(idx, Math.max(0, nodes.length - 1));
  const cur = nodes[safeIdx];

  // 現在のカードにつながっている相手を、関係の種類ごとにまとめる
  const links = useMemo(() => {
    if (!cur) return [];
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    return incidentEdges(cur.id, edges, showRelated)
      .map((e) => {
        const otherId = e.source_id === cur.id ? e.target_id : e.source_id;
        const other = byId.get(otherId);
        if (!other) return null;
        return {
          edgeId: e.id,
          other,
          relation: e.relation,
          // cur が source なら「cur が other を◯◯する」、逆なら「other が cur を◯◯する」
          outgoing: e.source_id === cur.id,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cur, nodes, edges, showRelated]);

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8">
        <p className="font-jp text-[13px] text-ink-soft text-center">
          まだカードがありません。
          <br />
          下の入力欄から意見を書いてみてください。
        </p>
      </div>
    );
  }
  if (!cur) return null;

  const meta = NODE_META[cur.type as NodeType];
  const editing = editingId === cur.id;
  const go = (d: number) => {
    setConfirming(false);
    setEditingId(null);
    setIdx(Math.min(nodes.length - 1, Math.max(0, safeIdx + d)));
  };
  const jumpTo = (id: string) => {
    const i = nodes.findIndex((n) => n.id === id);
    if (i >= 0) {
      setConfirming(false);
      setEditingId(null);
      setIdx(i);
    }
  };
  const startEdit = () => {
    setDraft(cur.text);
    setDraftType(cur.type as NodeType);
    setErr(null);
    setEditingId(cur.id);
  };
  const saveEdit = () => {
    const check = validateNodeText(draft);
    if (!check.ok) {
      setErr(check.reason ?? '入力を確認してください');
      return;
    }
    onEditNode?.(cur.id, draft.trim(), draftType);
    setErr(null);
    setEditingId(null);
  };

  return (
    <div className="h-full flex flex-col bg-paper">
      {/* 送り操作 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-white/80">
        <button
          onClick={() => go(-1)}
          disabled={safeIdx === 0}
          className="font-jp text-[13px] px-3 py-2 rounded border border-line disabled:opacity-35"
        >
          ← 前
        </button>
        <span className="font-mono text-[12px] text-ink-soft flex-1 text-center">
          {safeIdx + 1} / {nodes.length}
        </span>
        <button
          onClick={() => go(1)}
          disabled={safeIdx >= nodes.length - 1}
          className="font-jp text-[13px] px-3 py-2 rounded border border-line disabled:opacity-35"
        >
          次 →
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {/* いま見ているカード */}
        <div
          className="rounded-lg bg-white px-4 py-3 shadow-sm"
          style={{
            border: `${cur.is_final ? 3 : 2}px solid ${cur.is_final ? '#d97706' : meta.color}`,
          }}
        >
          {editing ? (
            /* 編集モード（要望#5の完結: モバイルの主導線でも編集できる。
               以前は削除だけで、編集はキャンバスに戻る必要があった） */
            <>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {NODE_TYPE_ORDER.map((k) => {
                  const m = NODE_META[k];
                  const on = k === draftType;
                  return (
                    <button
                      key={k}
                      onClick={() => setDraftType(k)}
                      className="font-jp text-[12px] font-bold rounded-full px-3 py-1.5 border"
                      style={{
                        borderColor: m.color,
                        background: on ? m.color : '#fff',
                        color: on ? '#fff' : m.color,
                      }}
                    >
                      {m.jaLabel}
                    </button>
                  );
                })}
              </div>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (err) setErr(null);
                }}
                rows={Math.min(10, Math.max(4, Math.ceil(draft.length / 20)))}
                maxLength={NODE_TEXT_MAX}
                className="w-full font-jp text-[16px] leading-relaxed text-ink border rounded px-2.5 py-2 resize-none break-words"
                style={{ borderColor: err ? '#c1121f' : '#d1d5db' }}
              />
              {err && (
                <div
                  className="font-jp text-[12px] mt-1"
                  style={{ color: '#c1121f' }}
                >
                  {err}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="font-mono text-[11px] text-ink-soft">
                  {[...draft.trim()].length}/{NODE_TEXT_MAX}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setErr(null);
                      setEditingId(null);
                    }}
                    className="font-jp text-[13px] px-3 py-2 rounded border border-line text-ink-soft"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveEdit}
                    className="font-jp text-[13px] font-bold px-4 py-2 rounded text-white"
                    style={{ background: meta.color }}
                  >
                    保存
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                className="font-mono text-[11px] font-bold mb-1.5"
                style={{ color: cur.is_final ? '#d97706' : meta.color }}
              >
                {cur.is_final ? 'ひとつの像' : meta.jaLabel}
              </div>
              <div className="font-jp text-[17px] leading-relaxed text-ink break-words whitespace-pre-wrap">
                {cur.text}
              </div>
              <div className="font-jp text-[11px] text-ink-soft mt-2 text-right break-words">
                — {cur.author_name}
              </div>
              {!cur.is_final && (
                <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-line">
                  {confirming ? (
                    <>
                      <span className="font-jp text-[12px] text-ink self-center mr-auto">
                        削除しますか？
                      </span>
                      <button
                        onClick={() => setConfirming(false)}
                        className="font-jp text-[13px] px-3 py-2 rounded border border-line text-ink-soft"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          onDeleteNode?.(cur.id);
                          setConfirming(false);
                        }}
                        className="font-jp text-[13px] font-bold px-3 py-2 rounded text-white"
                        style={{ background: '#c1121f' }}
                      >
                        削除
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startEdit}
                        className="font-jp text-[13px] px-3 py-2 rounded border border-line text-ink-soft"
                      >
                        ✎ 編集
                      </button>
                      <button
                        onClick={() => setConfirming(true)}
                        className="font-jp text-[13px] px-3 py-2 rounded border border-line text-ink-soft"
                      >
                        🗑 削除
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* つながっている意見 */}
        <div className="mt-4">
          <div className="font-mono text-[11px] text-ink-soft mb-2">
            つながっている意見（{links.length}）
          </div>
          {links.length === 0 && (
            <p className="font-jp text-[12px] text-ink-soft">
              まだつながりがありません。似た意見が増えると線が引かれます。
            </p>
          )}
          <div className="flex flex-col gap-2">
            {links.map((l) => {
              const rm = RELATION_META[l.relation];
              const om = NODE_META[l.other.type as NodeType];
              return (
                <button
                  key={l.edgeId}
                  onClick={() => jumpTo(l.other.id)}
                  className="text-left rounded-md bg-white border border-line px-3 py-2.5 active:bg-gray-50"
                >
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span
                      className="font-jp text-[10px] font-bold rounded-full px-2 py-0.5 text-white"
                      style={{ background: rm.color }}
                    >
                      {l.outgoing
                        ? `この意見が ${rm.jaLabel}`
                        : `この意見を ${rm.jaLabel}`}
                    </span>
                    <span
                      className="font-mono text-[10px] font-bold"
                      style={{ color: om.color }}
                    >
                      {om.jaLabel}
                    </span>
                  </div>
                  <div className="font-jp text-[14px] leading-snug text-ink break-words whitespace-pre-wrap line-clamp-4">
                    {l.other.text}
                  </div>
                  <div className="font-jp text-[10px] text-ink-soft mt-1 text-right">
                    — {l.other.author_name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
