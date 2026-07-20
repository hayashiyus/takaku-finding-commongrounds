// ===== ドメイン型（SPEC §5 / §7.3 に対応） =====

export type NodeType = 'fact' | 'insight' | 'idea' | 'hypothesis';

export type Relation =
  | 'supports' // 根拠づける
  | 'contradicts' // 対立する
  | 'elaborates' // 具体化する
  | 'reframes' // 再枠組みする
  | 'related'; // 関連（フォールバック / 無印）

export interface GraphNode {
  id: string;
  room_id: string;
  type: NodeType;
  text: string;
  author_name: string;
  author_id?: string | null; // 端末固有ID（投稿者の記録。編集/削除は誰でも可・2026-07-20変更。旧行はnull）
  embedding?: number[] | null;
  x?: number | null;
  y?: number | null;
  is_final: boolean;
  seq?: number;
  created_at?: string;
}

export interface GraphEdge {
  id: string;
  room_id: string;
  source_id: string;
  target_id: string;
  relation: Relation;
  confidence: number;
  rationale?: string | null;
  created_at?: string;
}

/** ルームの動作モード: pro=サーバレスLLM判定（講演デモ）/ lite=ブラウザ内AIのみ（授業） */
export type RoomMode = 'pro' | 'lite';

export interface Room {
  id: string;
  name?: string | null;
  final_idea?: string | null;
  mode?: RoomMode;
  llm_calls?: number;
  created_at?: string;
}

export interface PresenceUser {
  name: string;
  online_at: string;
}

// ===== /api/classify-links 入出力（SPEC §7.3） =====

export interface ClassifyCandidate {
  id: string;
  type: NodeType;
  text: string;
}

export interface ClassifyRequest {
  target: ClassifyCandidate;
  candidates: ClassifyCandidate[];
  /** 呼び出し上限（quota）用。旧クライアントは未送信 → サーバは room_required を返す */
  room_id?: string;
}

export type ClassifyRelation = Relation | 'none';
export type LinkDirection =
  | 'from_target_to_neighbor'
  | 'from_neighbor_to_target'
  | 'undirected';

export interface ClassifyLink {
  neighbor_id: string;
  relation: ClassifyRelation;
  direction: LinkDirection;
  confidence: number;
  rationale: string;
}

export interface ClassifyResponse {
  links: ClassifyLink[];
  /** 'quota_exceeded' | 'room_required' | その他サーバ側エラー（200で返る） */
  error?: string;
}

// ===== /api/synthesize 入出力（FINAL IDEA AI統合） =====
export interface SynthesizeRequest {
  room_id: string;
  nodes: ClassifyCandidate[];
  edges: { source_id: string; target_id: string; relation: Relation }[];
}
/** 成功時は text/plain ストリーム。失敗時のみ application/json { error } が200で返る */
export interface SynthesizeError {
  error: string; // 'room_required' | 'no_nodes' | 'quota_exceeded' | 'llm_error'
}
