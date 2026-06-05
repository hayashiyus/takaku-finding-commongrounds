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
1. このディレクトリ（`takaku-app/`）を Vercel に Import（Framework: Vite を自動検出）。
2. 環境変数（`VITE_*` とサーバ専用 `LLM_*` / `LINK_CONFIDENCE_THRESHOLD`）を設定。
3. Deploy。`api/*.ts` は自動でサーバレス関数になる。
4. 発行URLを2端末（PC＋実機スマホ）で開き、`../PLAN.md` §6 / SPEC §12 の受け入れ基準を確認。本番前に会場ネットワークで疎通確認。

## 実装フェーズ（現況）
- [x] **Phase 0** 足場（Vite+React+TS+Tailwind、schema、型、ルーティング、各種スケルトン）
- [ ] **Phase 1** リアルタイム土台（Realtime同期・Presence）← 次
- [ ] Phase 2 端末内埋め込み（Transformers.js）
- [ ] Phase 3 ハイブリッド・リンク（/api/classify-links）
- [ ] Phase 4 可視化・「整える」アニメ・投影耐性
- [ ] Phase 5 タイムライン再生・FINAL IDEA・PDF
- [ ] Phase 6 検証・負荷/実機/投影・デプロイ

## プライバシー（未成年利用 / SPEC §16）
個人情報は収集しない。表示名（ニックネーム）のみ。認証なし。ルームは一時的。
