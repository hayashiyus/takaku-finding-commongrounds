import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { useGraphStore } from '../store/graphStore';
import type { NodeType } from '../types';

const PRINT_META: Record<
  NodeType,
  {
    en: string;
    ja: string;
    color: string;
    shape: 'square' | 'diamond' | 'circle';
  }
> = {
  fact: {
    en: 'FACT',
    ja: '事実',
    color: '#1a1a20',
    shape: 'square',
  },
  insight: {
    en: 'INSIGHT',
    ja: '気づき',
    color: '#5f9e2f',
    shape: 'square',
  },
  hypothesis: {
    en: 'HYPOTHESIS',
    ja: '仮説',
    color: '#cc2b2b',
    shape: 'diamond',
  },
  idea: {
    en: 'IDEA',
    ja: 'アイディア',
    color: '#2585b0',
    shape: 'circle',
  },
};

type PrintMeta = (typeof PRINT_META)[NodeType];

function TypeMarker({ meta, size }: { meta: PrintMeta; size: 6 | 8 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        background: meta.color,
        flexShrink: 0,
        ...(meta.shape === 'diamond'
          ? { transform: 'rotate(45deg)' }
          : {}),
        ...(meta.shape === 'circle' ? { borderRadius: '9999px' } : {}),
      }}
    />
  );
}

const fmt = (iso?: string) =>
  iso
    ? new Date(iso)
        .toLocaleString('sv-SE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
        .replace('T', ' ')
    : '';

export default function PrintView() {
  const { roomId = '' } = useParams();
  const nodes = useGraphStore((s) => s.nodes);
  const finalIdea = useGraphStore((s) => s.finalIdea);
  const { loading } = useRoom(roomId);
  const printedRef = useRef(false);

  const sortedNodes = useMemo(
    () =>
      nodes
        .map((node, index) => ({ node, index }))
        .sort((a, b) => {
          const aSeq = a.node.seq;
          const bSeq = b.node.seq;
          if (typeof aSeq === 'number' && typeof bSeq === 'number') {
            return aSeq - bSeq || a.index - b.index;
          }
          if (typeof aSeq === 'number') return -1;
          if (typeof bSeq === 'number') return 1;

          const aCreated = a.node.created_at
            ? Date.parse(a.node.created_at)
            : Number.NaN;
          const bCreated = b.node.created_at
            ? Date.parse(b.node.created_at)
            : Number.NaN;
          const aHasCreated = Number.isFinite(aCreated);
          const bHasCreated = Number.isFinite(bCreated);
          if (aHasCreated && bHasCreated) {
            return aCreated - bCreated || a.index - b.index;
          }
          if (aHasCreated) return -1;
          if (bHasCreated) return 1;
          return a.index - b.index;
        })
        .map(({ node }) => node),
    [nodes],
  );

  useEffect(() => {
    if (loading || printedRef.current) return;
    printedRef.current = true;
    window.setTimeout(() => window.print(), 800);
  }, [loading]);

  const today = new Date().toLocaleDateString('sv-SE');
  const total = sortedNodes.length;

  return (
    <>
      <style>{`@media print { @page { margin: 12mm; } }`}</style>
      {loading ? (
        <div className="flex items-center justify-center h-screen font-jp text-[14px] text-[#666]">
          読み込み中…
        </div>
      ) : (
        <div className="max-w-[800px] mx-auto bg-white text-[#1a1a20] px-6 py-6 sm:px-10 sm:py-8">
          <div className="print:hidden sticky top-0 z-10 flex items-center gap-3 mb-4 py-2 bg-white">
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-[#1a1a20] text-white text-[12px] font-jp px-4 py-2 rounded hover:opacity-80"
            >
              🖨 印刷 / PDFとして保存
            </button>
            <Link
              to={`/r/${roomId}`}
              className="font-jp text-[12px] text-[#666] hover:text-[#1a1a20]"
            >
              ← ルームへ戻る
            </Link>
          </div>

          <header className="flex justify-between items-center mb-10">
            <div className="font-mono text-[11px] font-bold tracking-[0.2em] flex items-center gap-2">
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  background: '#c8d900',
                }}
              />
              TAKAKU
            </div>
            <div className="font-mono text-[10px] tracking-[0.15em] text-[#999]">
              ROOM /{' '}
              <span className="text-[#333] font-bold">
                {roomId.toUpperCase()}
              </span>
              <span> · {today}</span>
            </div>
          </header>

          <h1 className="font-jp text-[26px] font-bold">
            多角的思考のキャンバス
          </h1>
          <div className="font-jp text-[12px] text-[#666] leading-relaxed mt-4 mb-8">
            <p>
              共有された{' '}
              <mark
                style={{
                  background:
                    'linear-gradient(transparent 60%, #e8f36a 60%)',
                }}
              >
                事実・気づき・アイディア・仮説
              </mark>{' '}
              を時系列で並べた、印刷専用ビュー。
            </p>
            <p>
              ブラウザの「印刷」ダイアログから「PDFとして保存」できます。
            </p>
          </div>

          <div className="font-mono text-[10px] tracking-[0.2em] text-[#999] mt-8 mb-4">
            STEPS · {total} NODES
          </div>

          <div>
            {sortedNodes.map((node, index) => {
              const meta = PRINT_META[node.type];
              return (
                <article
                  key={node.id}
                  className="border border-[#e2e2e2] bg-white px-6 py-5 mb-6 flex gap-6"
                  style={{ breakInside: 'avoid' }}
                >
                  <div className="w-[90px] shrink-0 border-r border-[#eee] pr-4">
                    <div className="font-mono text-[9px] tracking-[0.2em] text-[#999]">
                      STEP
                    </div>
                    <div className="font-mono text-[26px] font-bold leading-tight">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="font-mono text-[10px] text-[#999]">
                      / {total}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.15em] text-[#333]">
                      <TypeMarker meta={meta} size={8} />
                      <span>
                        {meta.en} /{' '}
                        <span className="font-jp">{meta.ja}</span>
                      </span>
                    </div>

                    <div className="border border-[#e5e5e5] px-5 py-4 mt-3">
                      <div
                        className="flex items-center gap-2 text-[9px] tracking-[0.15em] font-mono"
                        style={{ color: meta.color, opacity: 0.7 }}
                      >
                        <TypeMarker meta={meta} size={6} />
                        <span>
                          {meta.en} /{' '}
                          <span className="font-jp">{meta.ja}</span>
                        </span>
                      </div>
                      <div className="font-jp text-[15px] leading-relaxed mt-2 break-words whitespace-pre-wrap">
                        {node.text}
                      </div>
                      <div className="flex justify-between items-center mt-3">
                        <span className="font-mono text-[9px] tracking-[0.2em] text-[#666]">
                          {(node.author_name || '').toUpperCase()}
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.1em] text-[#999]">
                          {fmt(node.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {finalIdea.trim() && (
            <section
              className="bg-[#f4f4f2] px-6 py-5 mt-2"
              style={{ breakInside: 'avoid' }}
            >
              <div className="font-mono text-[10px] tracking-[0.2em] text-[#999]">
                FINAL IDEA
              </div>
              <div className="font-jp text-[15px] mt-2 leading-relaxed break-words whitespace-pre-wrap">
                {finalIdea}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
