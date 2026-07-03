// LinkEngine ファクトリ。rooms.mode（実行時・DB由来）でエンジンを選ぶ。
// VITE_FEATURE_LLM_LINKING=false は「緊急キルスイッチ」: モードを問わず cosine のみ。
import type { RoomMode } from '../../types';
import { classifyLinksCosine } from '../linking';
import type { CandidateParams } from '../linking';
import { createLiteEngine } from './liteEngine';
import { createProEngine } from './proEngine';
import { StatusEmitter } from './types';
import type { LinkEngine } from './types';

export type { EngineStatus, EngineTier, LinkEngine } from './types';

const KILL_SWITCH =
  String(import.meta.env.VITE_FEATURE_LLM_LINKING ?? 'true') === 'false';
const TOPK = Number(import.meta.env.VITE_LINK_TOPK ?? 6);

function createCosineEngine(): LinkEngine {
  const emitter = new StatusEmitter();
  emitter.emit({ state: 'ready', tier: 'cosine' });
  return {
    get tier() {
      return 'cosine' as const;
    },
    get candidateParams(): CandidateParams {
      return { hasClassifier: false, topk: TOPK };
    },
    classify: (target, candidates) =>
      Promise.resolve(classifyLinksCosine(target, candidates)),
    onStatus: (cb) => emitter.subscribe(cb),
  };
}

// (roomId, mode, highPrecision) ごとに memo 化（モデル二重ロード・購読リーク防止）
const cache = new Map<string, LinkEngine>();

export function getLinkEngine(
  roomId: string,
  mode: RoomMode,
  opts: { highPrecision: boolean },
): LinkEngine {
  if (KILL_SWITCH) {
    const key = 'kill';
    if (!cache.has(key)) cache.set(key, createCosineEngine());
    return cache.get(key) as LinkEngine;
  }
  const key = `${roomId}:${mode}:${opts.highPrecision ? 'hp' : 'std'}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      mode === 'pro' ? createProEngine(roomId) : createLiteEngine(opts),
    );
  }
  return cache.get(key) as LinkEngine;
}
