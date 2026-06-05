import { useState } from 'react';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // クリップボード不可環境では URL を選択表示
      window.prompt('このURLを共有してください', window.location.href);
    }
  };
  return (
    <button
      onClick={copy}
      className="font-jp text-[12px] font-bold border border-ink rounded-full px-3 py-1 hover:opacity-70"
    >
      {copied ? 'コピーしました' : '共有（URLコピー）'}
    </button>
  );
}
