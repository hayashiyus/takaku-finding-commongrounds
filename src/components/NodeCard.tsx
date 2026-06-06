import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { NODE_META } from '../lib/relations';
import type { NodeType } from '../types';

export interface NodeCardData {
  type: NodeType;
  text: string;
  author: string;
  isFinal?: boolean;
  dimmed?: boolean;
}

export default function NodeCard({ data, selected }: NodeProps) {
  const d = data as unknown as NodeCardData;
  const meta = NODE_META[d.type];
  return (
    <div
      className="rounded-md bg-white shadow-sm px-3 py-2 text-left"
      style={{
        border: `${d.isFinal ? 3 : 1.6}px solid ${d.isFinal ? '#d97706' : meta.color}`,
        width: 210,
        boxShadow: selected ? `0 0 0 3px ${meta.color}33` : undefined,
        opacity: d.dimmed ? 0.28 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="font-mono text-[10px] font-bold mb-1"
        style={{ color: d.isFinal ? '#d97706' : meta.color }}
      >
        {d.isFinal ? 'ひとつの像' : meta.jaLabel}
      </div>
      <div className="font-jp text-[14px] leading-snug text-ink">{d.text}</div>
      <div className="font-jp text-[11px] text-ink-soft mt-1 text-right">
        — {d.author}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
