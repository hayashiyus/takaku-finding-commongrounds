import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { NODE_META, NODE_TYPE_ORDER } from '../lib/relations';
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

export default function NodeCard({ data }: NodeProps) {
  const d = data as unknown as NodeCardData;
  const meta = NODE_META[d.type];
  const selected = !!d.selected;
  const lod = d.lod ?? 'high';
  const [hovered, setHovered] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(d.text);
  const [draftType, setDraftType] = useState<NodeType>(d.type);

  // LOD: 遠い(low)は色チップ化して情報を間引き、近づくと詳細を出す。
  const showBadge = lod !== 'low'; // low は種類文字を隠し、枠の色で種類を示す
  const showAuthor = (selected || hovered) && lod !== 'low'; // 名前は選択/ホバー時のみ
  const bodyClamp =
    lod === 'low' ? 'line-clamp-1' : lod === 'mid' ? 'line-clamp-3' : '';

  // 誰でもすべてのカードを編集/削除できる（委員会要望・2026-07-20）。FINAL採用中と再生中のみ不可。
  const canManage = !d.isFinal && !d.replaying;
  const showControls =
    canManage && lod !== 'low' && (selected || mode !== 'view');

  const startEdit = () => {
    setDraft(d.text);
    setDraftType(d.type);
    setMode('edit');
  };
  const save = () => {
    const t = draft.trim();
    if (t) d.onEdit?.(d.id, t, draftType);
    setMode('view');
  };
  const cancel = () => setMode('view');
  const doDelete = () => {
    d.onDelete?.(d.id);
    setMode('view');
  };

  return (
    <div
      className="rounded-md bg-white shadow-sm px-3 py-2 text-left"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `${d.isFinal ? 3 : 1.6}px solid ${d.isFinal ? '#d97706' : meta.color}`,
        width: 210,
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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              if (e.key === 'Escape') cancel();
            }}
            rows={3}
            className="w-full font-jp text-[14px] leading-snug text-ink border rounded px-1.5 py-1 resize-none"
            style={{ borderColor: '#d1d5db' }}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-jp text-[9px] text-ink-soft">⌘/Ctrl+Enter</span>
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
          <div className={`font-jp text-[14px] leading-snug text-ink ${bodyClamp}`}>
            {d.text}
          </div>
          {showAuthor && (
            <div className="font-jp text-[11px] text-ink-soft mt-1 text-right">
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
