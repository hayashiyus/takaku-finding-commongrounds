# 相関図ツール TAKAKU（本番版 / 7-21納品）

多人数同時参加の合意形成支援ツール。参加者が「事実・気づき・アイデア・仮説」を書き込むと、AIが**意味にもとづいて関係を判定して線で結び**、ばらばらの発想を1枚の像へ統合する。

- 仕様：`../SPEC.md` ／ 実装計画・フェーズ：`../PLAN.md`
- 技術：React 18 + TypeScript + Vite / Tailwind / @xyflow/react + d3-force / Transformers.js（端末内埋め込み）/ Supabase（Realtime/Postgres/pgvector）/ Vercel Functions（型付きリンクLLM）

## セットアップ

### 1. 依存
```bash
npm install
```

### 2. Supabase（無料プロジェクト）
1. https://supabase.com で新規プロジェクト作成。
2. SQL Editor で `supabase/schema.sql` を実行（pgvector・RLS・Realtime publication を含む）。
3. Project Settings → API から **Project URL** と **anon key** を取得。

### 3. 環境変数
`.env.example` を `.env.local` にコピーし、値を設定：
```
VITE_SUPABASE_URL=...           # Supabase Project URL
VITE_SUPABASE_ANON_KEY=...      # anon key
VITE_EMBEDDING_MODEL=Xenova/multilingual-e5-small
VITE_FEATURE_LLM_LINKING=true   # false で類似度のみ（LLM不要・ゼロコスト）
VITE_LINK_TOPK=6
VITE_LINK_SIM_FLOOR=0.30
```
LLM 型付きリンク（Phase 3 以降）を使う場合は、**サーバ専用**変数を Vercel 側に設定（クライアントへ出さない）：
```
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5      # 実装時に公式ドキュメントで最新名/料金を確認
LLM_API_KEY=...
LINK_CONFIDENCE_THRESHOLD=0.6
```

## 開発
```bash
npm run dev      # http://localhost:5173
```
> Supabase 未設定でも起動し、ローカルにシード（再生厚紙テーマ）を表示します（同期なし）。`.env.local` 設定後に複数端末同期が有効になります。

## ビルド / 型チェック
```bash
npm run build    # tsc -b && vite build
```

## デプロイ（サーバ運用なし / SPEC §14）
1. このディレクトリ（`takaku-app/`）を Vercel に Import。**Root Directory に `takaku-app` を指定**（Framework: Vite を自動検出。Build `vite build` / Output `dist`）。
2. **環境変数を設定**（下表）。`VITE_*` はクライアント公開可、それ以外はサーバ専用（クライアントへ出さない）。
3. Deploy。`api/*.ts` は自動で関数化。`vercel.json` の rewrite で `/r/:roomId` 直リンクも index.html へ。
4. 発行URLを2端末（PC＋実機スマホ）で開き、SPEC §12 の受け入れ基準を確認。**本番前に会場ネットワークで WebSocket 疎通を必ず確認**。

### 本番 環境変数チェックリスト
| 変数 | 例 / 値 | 公開 |
|---|---|---|
| `VITE_SUPABASE_URL` | https://xxx.supabase.co | クライアント |
| `VITE_SUPABASE_ANON_KEY` | sb_publishable_... | クライアント |
| `VITE_EMBEDDING_MODEL` | Xenova/multilingual-e5-small | クライアント |
| `VITE_FEATURE_LLM_LINKING` | `true`（LLM型付き）/ `false`（類似度のみ） | クライアント |
| `VITE_LINK_TOPK` | 6 | クライアント |
| `VITE_LINK_SIM_FLOOR` | 0.80（LLM時は内部で≤0.40に） | クライアント |
| `LLM_PROVIDER` | anthropic | **サーバ専用** |
| `LLM_MODEL` | claude-haiku-4-5 | **サーバ専用** |
| `LLM_API_KEY` | sk-ant-... | **サーバ専用** |
| `LINK_CONFIDENCE_THRESHOLD` | 0.6 | **サーバ専用** |

> LLM型付き分類を使うには **Anthropic アカウントにクレジットが必要**（実測見積 200ノードで ~$0.6）。未設定/残高無しでも `VITE_FEATURE_LLM_LINKING=false` で類似度fallback動作。

## 実装フェーズ（現況）
- [x] **Phase 0** 足場（Vite+React+TS+Tailwind、schema、型、ルーティング、各種スケルトン）
- [x] **Phase 1** リアルタイム土台（Realtime同期・Presence）— 実測 158ms / Presence確認
- [x] **Phase 2** 端末内埋め込み（Transformers.js, multilingual-e5-small, cosine top-k）
- [x] **Phase 3** ハイブリッド・リンク
  - fallback（類似度のみ `related`）✓／**LLM型付き分類**（tool use, `claude-haiku-4-5`, `api/_classify.ts` + `api/classify-links.ts` Edge + dev用 vite plugin）実装・配線済 ✓
  - 検証：dev endpoint まで疎通（キー有効・構造化エラー確認）。**LLM出力の最終確認は Anthropic クレジット残高待ち**（console.anthropic.com → Plans & Billing）。
  - 知見：e5は同言語短文だと無関係でも cosine≈0.79 → fallback floor を 0.82 に調整。LLMモードは recall優先（floor≤0.40）で候補化し、LLMが最終判定。
  - コスト実測見積：Haiku 4.5（$1/$5 per MTok）で ~$0.003/node ＝ 200node で ~$0.6（数十〜数百円, §12内）。
- [x] **Phase 4** 可視化・体験：CSS transitionで「整える」滑らか移動、fitView再適用（追加/整える/リサイズ）、クリックで近傍ハイライト（非近傍を減光）、Legend/TopBarのレスポンシブ、1920×1080投影で可読を確認
- [x] **Phase 5** 署名機能：タイムライン再生（追加順に出現＋スクラブ）/ FINAL IDEA（rooms.final_idea保存・is_final強調）/ PDF出力（グラフ画像＋ノード一覧＋FINAL、JPEG化で約4MB・0.5秒）/ 共有URL・Presence
- [~] **Phase 6** 検証・デプロイ：20クライアント/100ノード負荷テスト ✅（100挿入0失敗・realtime100受信・100ノード描画）/ §12セルフレビュー ✅ / vercel.json・env手順整備 ✅ ／ **残：Vercelデプロイ実行・実機スマホ・会場NW疎通（環境依存=ユーザー側）**・LLMクレジット投入・（任意）/api/synthesize

## プライバシー（未成年利用 / SPEC §16）
個人情報は収集しない。表示名（ニックネーム）のみ。認証なし。ルームは一時的。
