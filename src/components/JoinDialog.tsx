import { useState } from 'react';

export default function JoinDialog({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState('');
  const join = () => {
    const n = name.trim();
    if (!n) return;
    onJoin(n);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl px-7 py-6 w-[340px] max-w-[90vw]">
        <h2 className="font-serif text-xl font-bold mb-1">相関図ツールに参加</h2>
        <p className="font-jp text-[13px] text-ink-soft mb-4">
          表示名（ニックネーム）を入力してください。登録・パスワードは不要です。
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') join();
          }}
          maxLength={12}
          autoFocus
          placeholder="例：さくら"
          className="w-full font-jp text-[15px] border border-line rounded px-3 py-2 outline-none mb-4"
        />
        <button
          onClick={join}
          className="w-full font-jp text-[15px] font-bold rounded px-4 py-2 text-white"
          style={{ background: '#2585b0' }}
        >
          参加する
        </button>
      </div>
    </div>
  );
}
