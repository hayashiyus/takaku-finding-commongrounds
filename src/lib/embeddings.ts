// 端末内埋め込み（SPEC §7.1）。Transformers.js v3、WebGPU優先・WASMフォールバック。
// 初回DL→IndexedDBキャッシュ。未ロードでも入力は可能（埋め込みは遅延付与）。
import { pipeline } from '@huggingface/transformers';

const MODEL =
  (import.meta.env.VITE_EMBEDDING_MODEL as string | undefined) ||
  'Xenova/multilingual-e5-small';
// e5系は非対称検索用に query:/passage: プレフィックスを推奨。ノード同士の対称類似なので
// 全テキストへ一貫して同一プレフィックスを付け、cosineの基準を揃える。
const IS_E5 = /e5/i.test(MODEL);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;
let ready = false;

export function embeddingsReady(): boolean {
  return ready;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadEmbedder(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL, {
      dtype: 'q8', // int8量子化（軽量・スマホ向け）
    }).then((p) => {
      ready = true;
      return p;
    });
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await loadEmbedder();
  const input = IS_E5 ? `query: ${text}` : text;
  const output = await extractor(input, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
