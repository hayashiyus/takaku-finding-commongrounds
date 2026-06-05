import type { GraphNode } from '../types';

export interface PdfOptions {
  roomName: string;
  nodes: GraphNode[];
  finalIdea: string | null;
  canvasEl: HTMLElement | null;
}

// Phase 5 で実装（jsPDF + html-to-image）。グラフ画像＋ノード一覧＋FINAL IDEA。
export async function exportPdf(_opts: PdfOptions): Promise<void> {
  throw new Error('PDF出力は Phase 5 で実装予定です。');
}
