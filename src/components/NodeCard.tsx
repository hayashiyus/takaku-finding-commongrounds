import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { NODE_META, NODE_TYPE_ORDER } from '../lib/relations';
import { CARD_W } from '../lib/cardMetrics';
import { NODE_TEXT_MAX, validateNodeText } from '../lib/validation';
import type { NodeType } from '../types';

export interface NodeCardData {
  id: string;
  type: NodeType;
  text: string;
  author: string;
  createdAt?: string;
  isFinal?: boolean;
  selected?: boolean; // アプリ独自の選択状態
  dimmed?: boolean;
  replaying?: boolean; // タイムライン再生中は操作を出さない
  lod?: 'low' | 'mid' | 'high'; // ズーム段階（low=色チップ / mid=本文 / high=フル）
  onEdit?: (id: string, text: string, type: NodeType) => void;
  onDelete?: (id: string) => void;
}

type Mode = 'view' | 'edit' | 'confirm';

// React Flow のドラッグ/パン/選択トグルへ伝播させない
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

// 展開表示（選択＋高ズーム）でも本文がここを超えたら内部スクロールにする。
// カード自体が青天井に伸びると、レイアウト計算の想定高（CARD_H_LAYOUT）を破って
// 隣や下の帯に食い込む（アンケート要望#1(B)）。
const EXPANDED_BODY_MAX_H = 168;

// Tailwind はソース中のリテラル文字列しか拾わないため、clamp クラスは必ずベタ書きする
// （`line-clamp-${n}` のような組み立ては CSS が生成されず無効になる）。
// 行数は cardMetrics.ts の BODY_LINES_* と対応させること。
const CLAMP: Record<'low' | 'mid' | 'high', string> = {
  low: 'line-clamp-1',
  mid: 'line-clamp-3',
  high: 'line-clamp-6',
};

function NodeCard({ data }: NodeProps) {
  const d = data as unknown as NodeCardData;
  const meta = NODE_META[d.type];
  const selected = !!d.selected;
  const lod = d.lod ?? 'high';
  const [hovered, setHovered] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(d.text);
  const [draftType, setDraftType] = useState<NodeType>(d.type);
  const [err, setErr] = useState<string | null>(null);

  // LOD: 遠い(low)は色チップ化して情報を間引き、近づくと詳細を出す。
  const showBadge = lod !== 'low'; // low は種類文字を隠し、枠の色で種類を示す
  const showAuthor = (selected || hovered) && lod !== 'low'; // 名前は選択/ホバー時のみ

  // 要望#1(C): 以前は lod==='high' で clamp が外れ、ズームインしただけで全カードが
  // 縦に膨らんで整列が重なりに変わっていた。全文を読めるのは「選択したカード」だけにする。
  const expanded = selected && lod === 'high';
  const bodyClamp = expanded ? '' : CLAMP[lod];

  // 誰でもすべてのカードを編集/削除できる（委員会要望・2026-07-20）。FINAL採用中と再生中のみ不可。
  const canManage = !d.isFinal && !d.replaying;
  const showControls =
    canManage && lod !== 'low' && (selected || mode !== 'view');

  const startEdit = () => {
    setDraft(d.text);
    setDraftType(d.type);
    setErr(null);
    setMode('edit');
  };
  const save = () => {
    // 要望#7: 短すぎる入力をここで止める。以前は trim() の空チェックしか無かった。
    const check = validateNodeText(draft);
    if (!check.ok) {
      setErr(check.reason ?? '入力を確認してください');
      return;
    }
    d.onEdit?.(d.id, draft.trim(), draftType);
    setErr(null);
    setMode('view');
  };
  const cancel = () => {
    setErr(null);
    setMode('view');
  };
  const doDelete = () => {
    d.onDelete?.(d.id);
    setMode('view');
  };

  const draftLen = [...draft.trim()].length;

  return (
    <div
      // 要望#1(A): 幅は固定なのに折り返し指定が無く、URL や英単語が枠を突き抜けていた。
      // overflow-hidden で確実にクリップする（PrintView と同じ扱いに揃える）。
      className="rounded-md bg-white shadow-sm px-3 py-2 text-left overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `${d.isFinal ? 3 : 1.6}px solid ${d.isFinal ? '#d97706' : meta.color}`,
        width: CARD_W,
        boxShadow: selected ? `0 0 0 3px ${meta.color}33` : undefined,
        opacity: d.dimmed ? 0.28 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {mode === 'edit' ? (
        <div className="nodrag nopan" onClick={stop} onPointerDown={stop}>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {NODE_TYPE_ORDER.map((k) => {
              const m = NODE_META[k];
              const on = k === draftType;
              return (
                <button
                  key={k}
                  onClick={() => setDraftType(k)}
                  className="font-jp text-[10px] font-bold rounded-full px-2.5 py-1 border"
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              if (e.key === 'Escape') cancel();
            }}
            // 要望#1(D): rows 固定だと編集中の見た目と保存後の高さが食い違い、
            // 保存した瞬間にカードが伸びて周囲に食い込む。内容に追従させる。
            rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 22)))}
            maxLength={NODE_TEXT_MAX}
            className="w-full font-jp text-[14px] leading-snug text-ink border rounded px-1.5 py-1 resize-none break-words"
            style={{ borderColor: err ? '#c1121f' : '#d1d5db' }}
          />
          {err && (
            <div className="font-jp text-[11px] mt-1" style={{ color: '#c1121f' }}>
              {err}
            </div>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-jp text-[9px] text-ink-soft">
              {draftLen}/{NODE_TEXT_MAX}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={cancel}
                className="font-jp text-[12px] px-3 py-1.5 rounded border border-gray-300 text-ink-soft"
              >
                取消
              </button>
              <button
                onClick={save}
                className="font-jp text-[12px] font-bold px-3 py-1.5 rounded text-white"
                style={{ background: meta.color }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {(showBadge || d.isFinal) && (
            <div
              className="font-mono text-[10px] font-bold mb-1"
              style={{ color: d.isFinal ? '#d97706' : meta.color }}
            >
              {d.isFinal ? 'ひとつの像' : meta.jaLabel}
            </div>
          )}
          <div
            // nowheel: 展開時の内部スクロールでキャンバスがズームしないように
            className={`font-jp text-[14px] leading-snug text-ink break-words whitespace-pre-wrap ${bodyClamp} ${expanded ? 'nowheel nodrag' : ''}`}
            style={
              expanded
                ? { maxHeight: EXPANDED_BODY_MAX_H, overflowY: 'auto' }
                : undefined
            }
          >
            {d.text}
          </div>
          {showAuthor && (
            <div className="font-jp text-[11px] text-ink-soft mt-1 text-right break-words">
              {d.createdAt && (
                <span className="mr-1">
                  {new Date(d.createdAt).toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              — {d.author}
            </div>
          )}

          {showControls && mode === 'view' && (
            <div
              className="nodrag nopan flex justify-end gap-1.5 mt-1.5 pt-1.5 border-t"
              style={{ borderColor: '#eee' }}
              onClick={stop}
              onPointerDown={stop}
            >
              <button
                onClick={startEdit}
                className="font-jp text-[12px] px-3 py-1.5 rounded border border-gray-300 text-ink-soft hover:bg-gray-50"
              >
                ✎ 編集
              </button>
              <button
                onClick={() => setMode('confirm')}
                className="font-jp text-[12px] px-3 py-1.5 rounded border border-gray-300 text-ink-soft hover:bg-gray-50"
              >
                🗑 削除
              </button>
            </div>
          )}

          {mode === 'confirm' && (
            <div
              className="nodrag nopan mt-1.5 pt-1.5 border-t"
              style={{ borderColor: '#eee' }}
              onClick={stop}
              onPointerDown={stop}
            >
              <div className="font-jp text-[11px] text-ink mb-1">
                このカードを削除しますか？
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={cancel}
                  className="font-jp text-[12px] px-3 py-1.5 rounded border border-gray-300 text-ink-soft"
                >
                  取消
                </button>
                <button
                  onClick={doDelete}
                  className="font-jp text-[12px] font-bold px-3 py-1.5 rounded text-white"
                  style={{ background: '#c1121f' }}
                >
                  削除
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// 要望#3: ストア更新のたびに全カードが再レンダリングされ、React Flow が全ノードの
// 寸法を同期再計測していた。GraphCanvas 側で data の参照を安定させたうえで memo 化する。
export default memo(NodeCard);
