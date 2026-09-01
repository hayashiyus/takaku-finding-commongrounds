import { useState } from 'react';
import { NODE_META, NODE_TYPE_ORDER } from '../lib/relations';
import {
  NODE_TEXT_MAX,
  textLength,
  validateNodeText,
} from '../lib/validation';
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
  const [err, setErr] = useState<string | null>(null);

  // 要望#7: 短すぎる意見を投稿前に止める。以前は空文字チェックしかなく、
  // 「あ」1文字のカードが埋め込み→関係判定→FINAL IDEA まで通っていた。
  const check = validateNodeText(text);
  const len = textLength(text);

  const submit = () => {
    if (!check.ok) {
      setErr(check.reason ?? '入力を確認してください');
      return;
    }
    onSubmit(type, text.trim());
    setText('');
    setErr(null);
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
      <div className="flex items-baseline gap-2 mb-1">
        <p
          className="font-jp text-[10px] flex-1 text-ink-soft"
          style={err ? { color: '#c1121f' } : undefined}
        >
          {err ??
            check.hint ??
            '単語より「一文」で書くと、AIが関係（根拠・対立など）を見つけやすくなります'}
        </p>
        {len > 0 && (
          <span
            className="font-mono text-[10px] shrink-0"
            style={{ color: len > NODE_TEXT_MAX ? '#c1121f' : '#8a8a85' }}
          >
            {len}/{NODE_TEXT_MAX}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          maxLength={NODE_TEXT_MAX}
          placeholder={NODE_META[type].example}
          className="flex-1 font-jp text-[16px] sm:text-[15px] border rounded px-3 py-2.5 sm:py-2 outline-none"
          style={{ borderColor: err ? '#c1121f' : '#cdc8b8' }}
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
