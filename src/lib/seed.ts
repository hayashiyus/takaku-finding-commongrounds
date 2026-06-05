import type { NodeType } from '../types';

export interface SeedNode {
  type: NodeType;
  text: string;
  author_name: string;
}

// SPEC §4末尾のシードデータ（再生厚紙／中島商店テーマ）。
// 起動直後に「生きた状態」を見せ、線の品質を目視評価する基準にも使う（§12 シナリオ3）。
export const SEED_NODES: SeedNode[] = [
  // 事実
  { type: 'fact', text: '厚紙は好きな形にカット可能', author_name: 'れん' },
  { type: 'fact', text: '使い捨てプラが紙に置換されている', author_name: 'あおい' },
  { type: 'fact', text: '長く使う製品に紙は使えない', author_name: 'ゆうき' },
  { type: 'fact', text: '厚紙に印刷ができる', author_name: 'みお' },
  { type: 'fact', text: 'ハンガーを作った実績がある', author_name: 'そう' },
  // 気づき
  { type: 'insight', text: '紙の質感がかわいい', author_name: 'さくら' },
  { type: 'insight', text: '子どもでも安全に扱える', author_name: 'ゆい' },
  { type: 'insight', text: 'プラより安価', author_name: 'はると' },
  { type: 'insight', text: '溝をつけると折れる', author_name: 'れん' },
  // アイデア
  { type: 'idea', text: '動物の形を組み合わせるパズル', author_name: 'あおい' },
  { type: 'idea', text: '使い終わったら平らに畳める紙の収納', author_name: 'ゆうき' },
  { type: 'idea', text: '書き込めるマグネット', author_name: 'みお' },
  // 仮説
  {
    type: 'hypothesis',
    text: '「長く使えない」弱点は、形が変わる楽しさに転換できるのでは？',
    author_name: 'れん',
  },
  {
    type: 'hypothesis',
    text: '紙は完成品でなく、使う人が完成させる素材として届けるべきでは？',
    author_name: 'さくら',
  },
  {
    type: 'hypothesis',
    text: '折る・書く・組む行為自体が、プラに真似できない「紙ならではの体験」では？',
    author_name: 'そら',
  },
];
