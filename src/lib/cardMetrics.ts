// カードの寸法を1か所に集約する（アンケート要望#1・2026-08-30）。
//
// 従来は同じ 210 が NodeCard.tsx（width）/ elkLayout.ts（NODE_W）/ GraphCanvas.tsx（バンド間隔）
// に三重ハードコードされ、さらに「カード高さは無制限なのにレイアウト計算は 96px 固定」
// という食い違いがあった。長文カードが実高 200〜400px になると隣や下の帯に食い込み、
// これが「文字が枠からはみ出して見えなくなる」の主因（縦方向）だった。
// 以降、DOM の実寸とレイアウト計算は必ずこのファイルの定数から導出する。

export const CARD_W = 210;

/** 本文の最大行数。NodeCard の line-clamp と 1:1 で対応させること。 */
export const BODY_LINES_LOW = 1;
export const BODY_LINES_MID = 3;
export const BODY_LINES_HIGH = 6;

/**
 * レイアウト計算に渡すカード高さ。
 * 最悪ケース（high・選択中で操作ボタンまで出た状態）を採用する。
 * 本文14px / leading-snug(1.375) ≒ 19.3px/行 × 6行 ≒ 116px
 *   + バッジ17 + 著者18 + 操作行40 + 余白24 ≒ 215px
 */
export const CARD_H_LAYOUT = 220;

/** バンド配置（「整える」前の初期配置）の間隔。カード実寸から導出する。 */
export const BAND_GAP_X = CARD_W + 30;
export const BAND_GAP_Y = CARD_H_LAYOUT + 40;

/** d3-force の衝突半径。カードの外接円の半径に少し余裕を足す。 */
export const COLLIDE_R =
  Math.round(Math.hypot(CARD_W, CARD_H_LAYOUT) / 2) + 8;
