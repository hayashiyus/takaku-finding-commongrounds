import type { NodeType, Relation } from '../types';

// ノード型のメタ（SPEC §8.2：FACT黒系/INSIGHT黄緑/IDEA青/HYPOTHESIS赤）
export const NODE_META: Record<
  NodeType,
  { jaLabel: string; color: string; bg: string; example: string }
> = {
  fact: {
    jaLabel: '事実',
    color: '#1a1a20',
    bg: '#ffffff',
    example: '例：再生紙は水にぬれると破れやすい',
  },
  insight: {
    jaLabel: '気づき',
    color: '#5f9e2f',
    bg: '#ffffff',
    example: '例：水への弱さが、屋外での使いみちを狭めている',
  },
  idea: {
    jaLabel: 'アイディア',
    color: '#2585b0',
    bg: '#ffffff',
    example: '例：防水加工した再生紙でアウトドア用メモ帳を作る',
  },
  hypothesis: {
    jaLabel: '仮説',
    color: '#cc2b2b',
    bg: '#ffffff',
    example: '例：防水にすれば屋外イベントで売れるのではないか',
  },
};

export const NODE_TYPE_ORDER: NodeType[] = [
  'fact',
  'insight',
  'idea',
  'hypothesis',
];

// 関係線のメタ（SPEC §7.4：色・線種・凡例）
export const RELATION_META: Record<
  Relation,
  { jaLabel: string; color: string; dash?: string; width: number }
> = {
  supports: { jaLabel: '根拠づける', color: '#2e7d32', width: 2 },
  contradicts: { jaLabel: '対立する', color: '#c1121f', dash: '6 4', width: 2 },
  elaborates: { jaLabel: '具体化する', color: '#5b6470', width: 2 },
  reframes: { jaLabel: '再枠組みする', color: '#6a1b9a', dash: '2 5', width: 2 },
  related: { jaLabel: '関連', color: '#9ca3af', width: 1 },
};

export const RELATION_ORDER: Relation[] = [
  'supports',
  'contradicts',
  'elaborates',
  'reframes',
  'related',
];
