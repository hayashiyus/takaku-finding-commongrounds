// PDF出力（SPEC §9.3）：グラフ画像＋ノード一覧＋FINAL IDEA。
// 日本語は html-to-image でラスタライズするため jsPDF への日本語フォント埋め込み不要。
import { jsPDF } from 'jspdf';
import { toJpeg, toPng } from 'html-to-image';
import { NODE_META } from './relations';
import type { GraphNode } from '../types';

export interface PdfOptions {
  roomName: string;
  nodes: GraphNode[];
  finalIdea: string | null;
  canvasEl: HTMLElement | null;
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<
        string,
        string
      >)[c],
  );
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '')
    .replace(/\s+/g, ' ')
    .replace(/^0(\d)\//, '$1/')
    .replace(/\/0(\d)(?=\s)/, '/$1')
    .replace(/\s24:/, ' 00:')
    .replace(/\s(\d):/, ' 0$1:');
}

function buildListEl(nodes: GraphNode[], finalIdea: string | null): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:-99999px;top:0;width:760px;padding:24px;background:#fff;font-family:"Noto Sans JP",sans-serif;color:#15151a;';
  const final = finalIdea
    ? `<div style="border:2px solid #d97706;border-radius:8px;padding:12px;margin-bottom:16px;"><div style="font-size:12px;color:#d97706;font-weight:700;">★ FINAL IDEA（ひとつの像）</div><div style="font-size:16px;font-weight:700;margin-top:4px;">${escapeHtml(finalIdea)}</div></div>`
    : '';
  const sortedNodes = [...nodes].sort((a, b) => {
    const aHasSeq = a.seq !== undefined;
    const bHasSeq = b.seq !== undefined;
    if (aHasSeq && bHasSeq) return a.seq! - b.seq!;
    if (aHasSeq) return -1;
    if (bHasSeq) return 1;

    const aCreatedAt = a.created_at
      ? new Date(a.created_at).getTime()
      : Number.NaN;
    const bCreatedAt = b.created_at
      ? new Date(b.created_at).getTime()
      : Number.NaN;
    const aHasCreatedAt = !Number.isNaN(aCreatedAt);
    const bHasCreatedAt = !Number.isNaN(bCreatedAt);
    if (aHasCreatedAt && bHasCreatedAt) return aCreatedAt - bCreatedAt;
    if (aHasCreatedAt) return -1;
    if (bHasCreatedAt) return 1;
    return 0;
  });
  const rows = sortedNodes
    .map((n) => {
      const m = NODE_META[n.type];
      const timestamp = formatCreatedAt(n.created_at);
      return `<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #eee;">
        <span style="flex:none;font-size:10px;font-weight:700;color:#fff;background:${m.color};border-radius:3px;padding:2px 6px;">${m.jaLabel}</span>
        ${timestamp ? `<span style="flex:none;font-size:10px;color:#888;white-space:nowrap;">${timestamp}</span>` : ''}
        <span style="flex:1;font-size:13px;">${escapeHtml(n.text)}</span>
        <span style="flex:none;font-size:11px;color:#888;">— ${escapeHtml(n.author_name)}</span>
      </div>`;
    })
    .join('');
  el.innerHTML = `<div style="font-size:18px;font-weight:700;margin-bottom:12px;">相関図ツール TAKAKU — 記録</div>${final}<div style="font-size:13px;font-weight:700;margin-bottom:6px;">ノード一覧（${nodes.length}件）（時系列）</div>${rows}`;
  return el;
}

export async function exportPdf(opts: PdfOptions): Promise<void> {
  const { roomName, nodes, finalIdea, canvasEl } = opts;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // 1) グラフ画像
  if (canvasEl) {
    const dataUrl = await toJpeg(canvasEl, {
      backgroundColor: '#f5f2e9',
      quality: 0.9,
      pixelRatio: 1.5, // JPEG＋1.5xでファイルサイズを抑制（テキストは可読）
      skipFonts: true, // CJK web font の巨大埋め込みを回避（ページ既読込フォントで描画）
      filter: (node) => {
        const cl = (node as HTMLElement).classList;
        return (
          !cl ||
          !(
            cl.contains('react-flow__minimap') ||
            cl.contains('react-flow__controls') ||
            cl.contains('react-flow__attribution')
          )
        );
      },
    });
    const img = await loadImg(dataUrl);
    pdf.setFontSize(13);
    pdf.text(`TAKAKU  /  Room: ${roomName}`, 20, 24);
    const ratio = Math.min((pageW - 40) / img.width, (pageH - 50) / img.height);
    pdf.addImage(dataUrl, 'JPEG', 20, 34, img.width * ratio, img.height * ratio);
  }

  // 2) ノード一覧＋FINAL（HTMLをラスタライズ）
  const listEl = buildListEl(nodes, finalIdea);
  document.body.appendChild(listEl);
  try {
    const listUrl = await toPng(listEl, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      skipFonts: true,
    });
    const limg = await loadImg(listUrl);
    pdf.addPage();
    const r2 = Math.min((pageW - 40) / limg.width, (pageH - 40) / limg.height);
    pdf.addImage(listUrl, 'PNG', 20, 20, limg.width * r2, limg.height * r2);
  } finally {
    document.body.removeChild(listEl);
  }

  pdf.save(`takaku-${roomName}.pdf`);
}
