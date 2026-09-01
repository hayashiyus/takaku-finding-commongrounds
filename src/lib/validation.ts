// カード本文の入力検証（アンケート要望#7・2026-08-30）。
//
// 高校生アンケート D列:「誤った意見入力や、短すぎる意見については、運営で削除するようにします」
// 対応する困りごと:「意見が多くなると取り込むものが多く、まとまらないことがあった」
//
// 従来は下限チェックがクライアント・サーバ・DB のいずれにも存在せず、「あ」1文字のカードでも
// 埋め込み → 関係判定 → FINAL IDEA 送信まで通っていた。短文は埋め込みの質が落ちるため
// 関係線がノイズになり、統合案もまとまらない。ここで下支えして運営の削除作業を減らす。

/** サーバ（api/synthesize.ts）が1ノードあたり400字でクランプするので、入力側を揃える。 */
export const NODE_TEXT_MAX = 400;

/** これ未満は投稿を拒否する。「あ」「テスト」を弾き、「PR強化」(4字) は通す。 */
export const NODE_TEXT_MIN = 4;

/** これ未満は投稿できるが注意を出し、FINAL IDEA の統合入力からは外す。 */
export const NODE_TEXT_SOFT_MIN = 10;

/** サーバが受け付けるノード数の上限（api/synthesize.ts の slice(0,200) と対応）。 */
export const SYNTH_NODE_LIMIT = 200;

export interface TextCheck {
  /** 投稿してよいか */
  ok: boolean;
  /** ok=false のときの拒否理由（利用者に見せる） */
  reason?: string;
  /** ok=true でも出す助言 */
  hint?: string;
}

/** 書記素ではなくコードポイント数で数える（日本語・絵文字で length が実感とずれるため）。 */
export function textLength(raw: string): number {
  return [...raw.trim()].length;
}

export function validateNodeText(raw: string): TextCheck {
  const n = textLength(raw);
  if (n === 0) return { ok: false, reason: '内容を入力してください' };
  if (n < NODE_TEXT_MIN)
    return {
      ok: false,
      reason: `短すぎます。${NODE_TEXT_MIN}文字以上で書いてください（いま ${n} 文字）`,
    };
  if (n > NODE_TEXT_MAX)
    return {
      ok: false,
      reason: `長すぎます。${NODE_TEXT_MAX}文字までにしてください（いま ${n} 文字）`,
    };
  if (n < NODE_TEXT_SOFT_MIN)
    return {
      ok: true,
      hint: '短い意見はAIが関係を見つけにくくなります。一文で書くと精度が上がります',
    };
  return { ok: true };
}

/**
 * FINAL IDEA の統合入力に含めてよいか。
 * 表示（カード）は残したまま、統合の材料からだけ外す。除外件数は UI に必ず出すこと。
 */
export function isSynthesizable(text: string): boolean {
  return textLength(text) >= NODE_TEXT_SOFT_MIN;
}
