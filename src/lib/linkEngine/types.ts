// LinkEngine 抽象（2モード拡張の核）。
// pro = サーバレスLLM（/api/classify-links）/ lite = webllm→nli→cosine の段階チェーン。
import type { GraphNode } from '../../types';
import type { Candidate, CandidateParams, ProposedEdge } from '../linking';

export type EngineTier = 'pro' | 'webllm' | 'nli' | 'cosine';

export type EngineStatus =
  | { state: 'preparing'; tier: EngineTier; progress?: number } // モデルDL/初期化中（progress: 0-100。100=完了）
  | { state: 'ready'; tier: EngineTier }
  | { state: 'error'; tier: EngineTier } // 段のロード失敗（下位段で継続）
  | { state: 'quota_exceeded' }; // pro のルーム上限到達（以降 cosine 降格）

export interface LinkEngine {
  /** 現在の実効 tier（UI表示用。lite はロード進行で昇格する） */
  readonly tier: EngineTier;
  /** 候補選定パラメータ（tier により recall/フロア・top-k が変わる） */
  readonly candidateParams: CandidateParams;
  /** 型付きエッジ案を返す。内部で失敗した場合は下位 tier に自動降格して必ず解決する */
  classify(
    target: GraphNode & { embedding: number[] },
    candidates: Candidate[],
  ): Promise<ProposedEdge[]>;
  /** 状態変化（DL進捗・昇格・quota）の購読。戻り値は unsubscribe */
  onStatus(cb: (s: EngineStatus) => void): () => void;
}

/** onStatus の共通実装（各エンジンが継承的に利用する小さなヘルパ） */
export class StatusEmitter {
  private listeners = new Set<(s: EngineStatus) => void>();
  private last: EngineStatus | null = null;

  emit(s: EngineStatus): void {
    this.last = s;
    for (const cb of this.listeners) cb(s);
  }

  subscribe(cb: (s: EngineStatus) => void): () => void {
    this.listeners.add(cb);
    if (this.last) cb(this.last); // 途中購読でも現在状態を即通知
    return () => {
      this.listeners.delete(cb);
    };
  }
}
