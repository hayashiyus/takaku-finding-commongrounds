// lite: ブラウザ内AIのみの段階チェーン（webllm → nli → cosine）。APIコスト・キー完全ゼロ。
// ロード完了を待たず、classify() 時点で使える最上位 tier を使う（準備中は cosine で結線し、
// 準備完了後の新規ノードから NLI/WebLLM が効く）。失敗は下位 tier へ自動降格。
import type { GraphNode } from '../../types';
import { TOPK_LITE, classifyLinksCosine } from '../linking';
import type { Candidate, CandidateParams, ProposedEdge } from '../linking';
import { classifyLinksNli, loadNli, nliReady } from './nli';
import { classifyLinksWebllm, loadWebllm, webllmReady, webllmSupported } from './webllm';
import { StatusEmitter } from './types';
import type { EngineStatus, EngineTier, LinkEngine } from './types';

const TOPK = Number(import.meta.env.VITE_LINK_TOPK ?? 6);

export function createLiteEngine(opts: { highPrecision: boolean }): LinkEngine {
  const emitter = new StatusEmitter();

  // WebLLM はロード済みでも「このエンジンの opts.highPrecision が true」のときだけ使う
  // （高精度トグル OFF のエンジンインスタンスは即座に NLI/cosine へ戻る）
  const useWebllm = () => opts.highPrecision && webllmReady();
  const currentTier = (): EngineTier =>
    useWebllm() ? 'webllm' : nliReady() ? 'nli' : 'cosine';

  const emitReady = () => emitter.emit({ state: 'ready', tier: currentTier() });

  // Tier2 (NLI) は入室時に自動プリロード（既存の埋め込みモデルと同じ思想）
  if (!nliReady()) {
    emitter.emit({ state: 'preparing', tier: 'nli', progress: 0 });
    void loadNli((pct) => {
      emitter.emit({ state: 'preparing', tier: 'nli', progress: pct }); // 100=完了もそのまま通知
    })
      .then(emitReady)
      .catch(() => {
        emitter.emit({ state: 'error', tier: 'nli' });
        emitReady(); // cosine で継続
      });
  } else {
    emitReady();
  }

  // Tier1 (WebLLM) はオプトイン時のみロード
  if (opts.highPrecision && webllmSupported() && !webllmReady()) {
    emitter.emit({ state: 'preparing', tier: 'webllm', progress: 0 });
    void loadWebllm((pct) => {
      emitter.emit({ state: 'preparing', tier: 'webllm', progress: pct });
    })
      .then(emitReady)
      .catch(() => {
        emitter.emit({ state: 'error', tier: 'webllm' });
        emitReady(); // nli/cosine で継続
      });
  }

  const classify = async (
    target: GraphNode & { embedding: number[] },
    candidates: Candidate[],
  ): Promise<ProposedEdge[]> => {
    if (candidates.length === 0) return [];
    // Tier1: WebLLM（失敗は NLI へ）
    if (useWebllm()) {
      try {
        return await classifyLinksWebllm(target, candidates);
      } catch {
        /* fall through to NLI */
      }
    }
    // Tier2: NLI（失敗は cosine へ）
    if (nliReady()) {
      try {
        return await classifyLinksNli(target, candidates);
      } catch {
        /* fall through to cosine */
      }
    }
    // Tier3: cosine（classifyLinksCosine が RELATED_FLOOR でゲート）
    return classifyLinksCosine(target, candidates);
  };

  return {
    get tier() {
      return currentTier();
    },
    get candidateParams(): CandidateParams {
      const t = currentTier();
      return t === 'cosine'
        ? { hasClassifier: false, topk: TOPK }
        : { hasClassifier: true, topk: TOPK_LITE };
    },
    classify,
    onStatus: (cb: (s: EngineStatus) => void) => emitter.subscribe(cb),
  };
}
