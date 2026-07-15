import { useState } from 'react';
import { NODE_META, NODE_TYPE_ORDER } from '../lib/relations';
import type { NodeType } from '../types';

export default function InputBar({
  onSubmit,
  disabled,
}: {
  onSubmit: (type: NodeType, text: string) => void;
  disabled?: boolean;
}) {
  const [type, setType] = useState<NodeType>('fact');
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(type, t);
    setText('');
  };

  return (
    <div className="border-t border-line bg-white/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:rounded-none sm:shadow-none sm:pb-3">
      <div className="flex gap-2 mb-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible">
        {NODE_TYPE_ORDER.map((k) => {
          const meta = NODE_META[k];
          const on = k === type;
          return (
            <button
              key={k}
              onClick={() => setType(k)}
              className="font-jp text-[13px] font-bold rounded-full px-3 py-2 sm:py-1 border-[1.5px] whitespace-nowrap shrink-0"
              style={{
                borderColor: meta.color,
                background: on ? meta.color : '#fff',
                color: on ? '#fff' : meta.color,
              }}
            >
              {meta.jaLabel}
            </button>
          );
        })}
      </div>
      <p className="font-jp text-[10px] text-ink-soft mb-1">
        単語より「一文」で書くと、AIが関係（根拠・対立など）を見つけやすくなります
      </p>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={NODE_META[type].example}
          className="flex-1 font-jp text-[16px] sm:text-[15px] border border-line rounded px-3 py-2.5 sm:py-2 outline-none"
        />
        <button
          onClick={submit}
          disabled={disabled}
          className="font-jp text-[14px] font-bold rounded px-5 min-h-11 sm:min-h-0 py-2.5 sm:py-2 whitespace-nowrap text-white disabled:opacity-50"
          style={{ background: '#2585b0' }}
        >
          送信 →
        </button>
      </div>
    </div>
  );
}
