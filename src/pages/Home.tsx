import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { RoomMode } from '../types';

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
  const [creating, setCreating] = useState<RoomMode | null>(null);
  const [createError, setCreateError] = useState('');

  const createRoom = async (mode: RoomMode) => {
    if (creating) return;
    setCreating(mode);
    setCreateError('');
    const id = randomRoomId();
    // pro は Home からの明示 insert のみ（URL直打ちの自動作成は DB default の lite になる）。
    // insert 失敗時は遷移しない（PRO希望なのに無警告で LITE 部屋に入るのを防ぐ）。
    if (supabase) {
      try {
        const { error } = await supabase.from('rooms').insert({ id, mode });
        if (error) throw error;
      } catch {
        setCreating(null);
        setCreateError(
          'ルームを作成できませんでした。通信状態を確認して再試行してください。',
        );
        return;
      }
    }
    nav(`/r/${id}`);
  };

  return (
    <div className="h-full overflow-y-auto px-6">
      <div className="min-h-full flex flex-col items-center justify-center gap-6 text-center py-8">
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

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl">
        <button
          onClick={() => void createRoom('pro')}
          disabled={creating !== null}
          className="flex-1 text-left font-jp rounded-xl border-2 p-5 bg-white hover:shadow-md transition-shadow disabled:opacity-60"
          style={{ borderColor: '#f59e0b' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="font-mono text-[10px] font-bold rounded px-1.5 py-0.5"
              style={{ background: '#fef3c7', color: '#b45309' }}
            >
              PRO
            </span>
            <span className="font-bold text-[16px]">本番LLM版</span>
          </div>
          <div className="text-[12.5px] text-ink-soft leading-relaxed">
            クラウドAI（Claude）が「根拠づける・対立する・具体化する・再枠組みする・関連」の
            <b>5種の関係</b>を高精度に判定。講演会・体験デモ向け。
          </div>
          <div className="text-[11px] text-ink-soft mt-1.5 opacity-70">
            API利用（少額のコストが発生・ルーム単位の上限つき）
          </div>
        </button>

        <button
          onClick={() => void createRoom('lite')}
          disabled={creating !== null}
          className="flex-1 text-left font-jp rounded-xl border-2 p-5 bg-white hover:shadow-md transition-shadow disabled:opacity-60"
          style={{ borderColor: '#94a3b8' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="font-mono text-[10px] font-bold rounded px-1.5 py-0.5"
              style={{ background: '#f1f5f9', color: '#475569' }}
            >
              LITE
            </span>
            <span className="font-bold text-[16px]">簡易版</span>
          </div>
          <div className="text-[12.5px] text-ink-soft leading-relaxed">
            <b>APIキー不要・コストゼロ</b>。ブラウザ内AI（軽量分類）が関係を判定。
            対応端末では高精度モード（端末内LLM）も選べます。授業向け。
          </div>
          <div className="text-[11px] text-ink-soft mt-1.5 opacity-70">
            初回のみモデルをダウンロード（端末にキャッシュされます）
          </div>
        </button>
      </div>

      {creating && (
        <div className="font-jp text-[12px] text-ink-soft">ルームを作成中…</div>
      )}
      {createError && (
        <div className="font-jp text-[12px] text-red-700">{createError}</div>
      )}
      </div>
    </div>
  );
}
