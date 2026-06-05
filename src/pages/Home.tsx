import { useNavigate } from 'react-router-dom';

function randomRoomId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export default function Home() {
  const nav = useNavigate();
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-center px-6">
      <div className="font-mono text-sm tracking-wide text-ink-soft">
        <span style={{ color: '#d97706' }}>◆</span> TAKAKU
      </div>
      <h1 className="font-serif text-4xl font-bold leading-tight">
        相関図ツール
        <br />
        <span className="text-2xl">多様な視点を、意味でひとつの像に。</span>
      </h1>
      <p className="font-jp text-ink-soft max-w-md leading-relaxed">
        事実・気づき・アイデア・仮説を出し合うと、AIが
        <b>意味にもとづいて関係を判定</b>し、ばらばらの発想を1枚の像へ統合します。
        誰が言ったか・声の大きさに左右されず、全員の視点を一貫した基準で公平に扱います。
      </p>
      <button
        onClick={() => nav(`/r/${randomRoomId()}`)}
        className="font-jp text-base font-bold rounded-lg px-7 py-3 text-white"
        style={{ background: '#2585b0' }}
      >
        新しいルームを作る
      </button>
    </div>
  );
}
