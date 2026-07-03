// pro: サーバレスLLM（/api/classify-links, Anthropic）による5種フル型付き判定。
// quota超過・ネットワーク失敗時は cosine（related）に降格して「線ゼロで壊れない」を保証。
import type { ClassifyRequest, ClassifyResponse, GraphNode } from '../../types';
import { classifyLinksCosine } from '../linking';
import type { Candidate, CandidateParams, ProposedEdge } from '../linking';
import { StatusEmitter } from './types';
import type { EngineStatus, LinkEngine } from './types';

const TOPK = Number(import.meta.env.VITE_LINK_TOPK ?? 6);

export function createProEngine(roomId: string): LinkEngine {
  const emitter = new StatusEmitter();
  let quotaExceeded = false;
  emitter.emit({ state: 'ready', tier: 'pro' });

  const classify = async (
    target: GraphNode & { embedding: number[] },
    candidates: Candidate[],
  ): Promise<ProposedEdge[]> => {
    if (candidates.length === 0) return [];
    if (quotaExceeded) return classifyLinksCosine(target, candidates);

    const body: ClassifyRequest = {
      room_id: roomId,
      target: { id: target.id, type: target.type, text: target.text },
      candidates: candidates.map((c) => ({
        id: c.node.id,
        type: c.node.type,
        text: c.node.text,
      })),
    };
    try {
      const res = await fetch('/api/classify-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`classify-links ${res.status}`);
      const data = (await res.json()) as ClassifyResponse;
      if (data.error === 'quota_exceeded') {
        quotaExceeded = true;
        emitter.emit({ state: 'quota_exceeded' });
        return classifyLinksCosine(target, candidates);
      }
      if (data.error) {
        // クレジット不足等: サーバは 200+error で返す。安全側で cosine 降格。
        return classifyLinksCosine(target, candidates);
      }
      const edges: ProposedEdge[] = [];
      for (const link of data.links) {
        if (link.relation === 'none') continue;
        let source_id = target.id;
        let target_id = link.neighbor_id;
        if (link.direction === 'from_neighbor_to_target') {
          source_id = link.neighbor_id;
          target_id = target.id;
        }
        edges.push({
          source_id,
          target_id,
          relation: link.relation,
          confidence: link.confidence,
          rationale: link.rationale,
        });
      }
      return edges;
    } catch {
      // ネットワーク断など: 線ゼロにせず cosine 降格
      return classifyLinksCosine(target, candidates);
    }
  };

  return {
    get tier() {
      return 'pro' as const;
    },
    get candidateParams(): CandidateParams {
      return { hasClassifier: !quotaExceeded, topk: TOPK };
    },
    classify,
    onStatus: (cb: (s: EngineStatus) => void) => emitter.subscribe(cb),
  };
}
