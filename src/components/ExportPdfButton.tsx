// PDF出力ボタン（SPEC §9.3）
import { useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { exportPdf } from '../lib/pdf';

export default function ExportPdfButton({ roomId }: { roomId: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { nodes, finalIdea } = useGraphStore.getState();
      const canvasEl = document.querySelector('.react-flow') as HTMLElement | null;
      await exportPdf({ roomName: roomId, nodes, finalIdea, canvasEl });
    } catch (e) {
      alert('PDF出力に失敗しました: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={run}
      disabled={busy}
      className="font-jp text-[12px] border border-ink rounded-full px-3 py-1 hover:opacity-70 disabled:opacity-50"
    >
      {busy ? 'PDF生成中…' : 'PDF出力'}
    </button>
  );
}
