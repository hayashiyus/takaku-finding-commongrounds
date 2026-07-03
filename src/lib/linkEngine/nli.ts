// lite Tier2: 多言語NLI（mDeBERTa XNLI）による型付き判定。ブラウザ内・WASM・WebGPU不要。
// 注意: text-classification パイプラインは text_pair を無視する（スパイクで確認）ため、
// tokenizer 直叩き + AutoModelForSequenceClassification で実装する。
// 判定可能: supports（entailment）/ contradicts（contradiction）/ related（高類似のneutral）。
// elaborates / reframes は NLI では原理的に判定できない（WebLLM/pro のみ）。
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  softmax,
} from '@huggingface/transformers';
import type { GraphNode } from '../../types';
import { RELATED_FLOOR } from '../linking';
import type { Candidate, ProposedEdge } from '../linking';

const MODEL =
  (import.meta.env.VITE_NLI_MODEL as string | undefined) ||
  'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';
// 実測（S0スパイク）: 明確なsupportsでも entailment 0.78 程度 → 既定 0.75（0.8では取りこぼす）
const THRESHOLD = Number(import.meta.env.VITE_NLI_THRESHOLD ?? 0.75);

interface NliScores {
  entailment: number;
  neutral: number;
  contradiction: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loaded: { tokenizer: any; model: any } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

export function nliReady(): boolean {
  return loaded !== null;
}

// 進捗リスナー: 複数の engine インスタンス（部屋の移動・高精度トグル等で生成）が
// 同一のモジュールロードを購読できるよう module レベルで束ねる。
const progressListeners = new Set<(pct: number) => void>();
let bestProgress = 0;
function emitProgress(pct: number): void {
  bestProgress = Math.max(bestProgress, pct);
  for (const cb of progressListeners) cb(bestProgress);
}

/** モデルをロード（初回DL≈339MB→ブラウザキャッシュ）。進捗は 0-100 で通知（100=完了）。 */
export async function loadNli(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (onProgress) {
    progressListeners.add(onProgress);
    if (bestProgress > 0) onProgress(bestProgress); // 途中参加でも現在値を即通知
  }
  if (loaded) {
    onProgress?.(100);
    return;
  }
  if (!loadPromise) {
    // ファイルごとの progress を集約し、最大値を全体進捗として報告（粗いが単調増加）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progress_callback = (p: any) => {
      if (p?.status === 'progress' && typeof p.progress === 'number') {
        emitProgress(Math.min(99, Math.round(p.progress)));
      }
    };
    loadPromise = Promise.all([
      AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
      AutoModelForSequenceClassification.from_pretrained(MODEL, {
        dtype: 'q8',
        progress_callback,
      }),
    ])
      .then(([tokenizer, model]) => {
        loaded = { tokenizer, model };
        emitProgress(100);
      })
      .catch((err: unknown) => {
        loadPromise = null; // 失敗を永続キャッシュしない（再試行可能に）
        throw err;
      });
  }
  await loadPromise;
}

/** 公開: 検証・デバッグ用（premise ⊨ hypothesis の3値確率） */
export async function scorePair(premise: string, hypothesis: string): Promise<NliScores> {
  if (!loaded) throw new Error('NLI model not loaded');
  const { tokenizer, model } = loaded;
  const inputs = tokenizer(premise, {
    text_pair: hypothesis,
    padding: true,
    truncation: true,
  });
  const { logits } = await model(inputs);
  const probs = softmax(logits.data as Float32Array);
  const out: NliScores = { entailment: 0, neutral: 0, contradiction: 0 };
  for (const [i, label] of Object.entries(
    model.config.id2label as Record<string, string>,
  )) {
    const key = label.toLowerCase() as keyof NliScores;
    if (key in out) out[key] = probs[Number(i)];
  }
  return out;
}

/**
 * 双方向NLIで target×候補を分類。
 * - どちらかの向きで contradiction ≥ θ → contradicts（undirected 扱い: target→候補で保存）
 * - entailment ≥ θ → supports（premise 側が source =「根拠づける」の向き）
 * - それ以外 → 高類似（RELATED_FLOOR 以上）のみ related、それ未満は結ばない
 */
export async function classifyLinksNli(
  target: GraphNode & { embedding: number[] },
  candidates: Candidate[],
): Promise<ProposedEdge[]> {
  const edges: ProposedEdge[] = [];
  for (const c of candidates) {
    // 逐次実行（低スペック端末で並列推論はメモリ・CPUを食い潰すため）
    const candAsPremise = await scorePair(c.node.text, target.text);
    const targetAsPremise = await scorePair(target.text, c.node.text);

    const contra = Math.max(
      candAsPremise.contradiction,
      targetAsPremise.contradiction,
    );
    if (contra >= THRESHOLD) {
      edges.push({
        source_id: target.id,
        target_id: c.node.id,
        relation: 'contradicts',
        confidence: contra,
        rationale: '両立しにくい内容（NLI判定）',
      });
      continue;
    }
    if (
      candAsPremise.entailment >= THRESHOLD &&
      candAsPremise.entailment >= targetAsPremise.entailment
    ) {
      edges.push({
        source_id: c.node.id,
        target_id: target.id,
        relation: 'supports',
        confidence: candAsPremise.entailment,
        rationale: '前者が後者を裏づける（NLI判定）',
      });
      continue;
    }
    if (targetAsPremise.entailment >= THRESHOLD) {
      edges.push({
        source_id: target.id,
        target_id: c.node.id,
        relation: 'supports',
        confidence: targetAsPremise.entailment,
        rationale: '前者が後者を裏づける（NLI判定）',
      });
      continue;
    }
    // neutral: 高類似のみ related（e5 の高ベースライン対策で RELATED_FLOOR を要求）
    if (c.sim >= RELATED_FLOOR) {
      edges.push({
        source_id: target.id,
        target_id: c.node.id,
        relation: 'related',
        confidence: c.sim,
      });
    }
  }
  return edges;
}
