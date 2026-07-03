# DESIGN.md — 相関図ツール TAKAKU 2モード拡張 詳細設計書

**対象**: 本番LLM版（pro）／簡易版（lite）の2機能を1つのアプリに統合する拡張
**日付**: 2026-07-03 ／ **ステータス**: 実装済み（本書は as-built 設計書）

---

## 1. 背景と要求

| モード | 想定現場 | 要求 |
|---|---|---|
| **pro（本番LLM版）** | 講演会の体験デモ。会場の複数参加者がノートPC等から入力 | 各入力を **LLM API**（Anthropic Claude, サーバレス経由）で高精度に型付き判定。品質最優先・少額コスト許容・**コスト上限必須** |
| **lite（簡易版）** | 高校の授業での常用 | **APIコスト・キー完全ゼロ**。無料Webサーバー上で動作し、**ブラウザ内推論のみ**で Transformers.js の素朴な埋め込み cosine より優れた言語処理 |

共通: 無料ホスティング（Vercel+Supabase 無料枠）、URLを開くだけで参加、日本語UI、リアルタイム同期。

## 2. 既存アプリの分析（拡張前）

- 関係判定の分岐は `src/lib/linking.ts` の `classifyLinks()` 一箇所。**ビルド時フラグ** `VITE_FEATURE_LLM_LINKING` で「/api/classify-links へPOST」か「全候補 related」かが固定され、**実行時・ルーム単位の切替は不可能**だった。
- ノード作成フロー: `Room.tsx createNode()` → 楽観的更新 → nodes insert → `embed()`（Xenova/multilingual-e5-small, int8, **384次元**）→ `selectCandidates()`（cosine top-k）→ 分類 → edges upsert（`UNIQUE(room_id,source_id,target_id)` 冪等）。
- **実測で判明していた課題**: multilingual-e5 は日本語短文だと**無関係でも cosine≈0.79**。閾値 0.82 で抑えているが、絶対閾値は 0.79–0.87 の狭帯に依存して脆い。→ 型付き分類器（LLM/NLI）が線品質の本質解。
- コスト保護 `LLM_MAX_CALLS_PER_ROOM` は env 定義のみで**未実装**だった（本拡張で実装）。

## 3. アーキテクチャ

### 3.1 LinkEngine 抽象（`src/lib/linkEngine/`）

```
Room.tsx createNode()
  └─ selectCandidates(target, all, engine.candidateParams)   // 候補選定は全モード共通(e5 cosine)
  └─ engine.classify(target, candidates)                      // ← モードで実装が変わる唯一の点
       ├─ proEngine  : POST /api/classify-links（room_id付き）→ Claude tool use
       │               quota_exceeded / ネットワーク断 → cosine に降格（線ゼロで壊さない）
       └─ liteEngine : 段階チェーン（その時点で使える最上位を使用・失敗は自動降格）
            Tier1 webllm : WebLLM+Qwen3-1.7B（WebGPU・オプトイン・~1GB）… 5種フル判定
            Tier2 nli    : mDeBERTa XNLI（WASM・自動プリロード・~339MB）… supports/contradicts/related
            Tier3 cosine : e5 類似度のみ … related
```

- **インターフェース**（`types.ts`）: `tier`（実効段・UI表示用）/ `candidateParams`（段に応じた選定パラメータ）/ `classify()` / `onStatus()`（DL進捗・昇格・quota の購読）。
- **ファクトリ**（`index.ts`）: `getLinkEngine(roomId, mode, {highPrecision})` を `(roomId, mode, hp)` で memo 化（モデル二重ロード防止）。`VITE_FEATURE_LLM_LINKING=false` は**緊急キルスイッチ**（全モード cosine）。
- **埋め込みは全モード e5-small 384d 共通**。NLI/WebLLM は「候補の分類」のみを担い、`nodes.embedding vector(384)`・`embById`・候補選定を一切変えない（DB migration 不要の要）。
- **候補選定フロア**（`linking.ts`）: 分類器あり = `min(env, 0.4)`（recall優先・最終判定は分類器）／cosine 単独 = env値 0.80+（e5高ベースライン対策）。lite の分類は `VITE_LINK_TOPK_LITE=3`（低スペック端末で 2×3=6 推論に制限）。

### 3.2 モードの決定（実行時・DB由来）

- `rooms.mode text not null default 'lite' check (mode in ('pro','lite'))`
- **default 'lite' が実効的なコスト保護**: `useRoom` は URL 直打ちでも rooms を upsert（id のみ）するため、勝手に作られた部屋は必ず lite＝LLM 不可。**pro は Home の「本番LLM版」カードからの明示 insert のみ**。
- 既存ルームは migration で一度だけ `mode='pro'` にバックフィル（従来動作の維持）。
- Room.tsx: `room.mode` 取得前（ロード中）は engine 未生成 → createNode は cosine（安全側）。Supabase 未設定（オフライン授業）は lite 固定。

### 3.3 pro の呼び出し上限（quota）

```
Edge Function api/classify-links.ts
  1. room_id 必須（無ければ {links:[],error:'room_required'} を200で＝旧クライアント互換）
  2. service_role で RPC increment_llm_calls(p_room_id, p_max) を素の fetch で呼ぶ
     - RPC は security definer / mode='pro' の行のみ加算 / llm_calls < p_max で true
     - lite の room_id・存在しない部屋 → false → {links:[],error:'quota_exceeded'}
  3. fail-open: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定・RPC異常時は quota スキップ
     （授業/講演を止めないことを優先。設定手順は README）
```
- クライアント側は `quota_exceeded` 受信で **cosine に降格**し黄バナー表示（体験は継続）。
- dev は vite middleware がプロセス内 Map で同じ応答形を再現（room_required / quota_exceeded を検証済み）。
- **限界（正直な記載）**: anon キーで rooms 行の偽造・`llm_calls` の直接 UPDATE が可能なため（RLS匿名全許可）、これは**グローバルなコスト上限ではない**。**Anthropic コンソールの spend limit 設定を運用必須**とする。根本対策（per-room secret / Turnstile）は非ゴール。

### 3.4 lite 段階式エンジンの技術選定（2026-07 調査・実測）

| Tier | 実装 | 根拠（出典確認済み） |
|---|---|---|
| 1 | `@mlc-ai/web-llm` 0.2.84 + `Qwen3-1.7B-q4f16_1-MLC`（VRAM 2,037MB / DL≈1GB） | WebGPU必須（WASM代替なし）。Safari 26+/Chrome/Edge対応。`response_format: json_object`（grammar制約）対応。HF CDN配信。**動的 import で別チャンク**（メインバンドル非汚染） |
| 2 | `Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`（quantized ≈339MB） | 訓練27言語に日本語。**重要な実装知見: Transformers.js の `text-classification` パイプラインは `{text, text_pair}` を無視する**（全ペア同一スコアになる）→ `AutoTokenizer`+`AutoModelForSequenceClassification` の**直叩き**で実装（スパイクで検証） |
| 3 | 既存 e5-small cosine | 常時可・現行踏襲 |

**NLI 判定則**（双方向推論・実測に基づく）:
- どちらかの向きで contradiction ≥ θ → `contradicts`
- entailment ≥ θ → `supports`（**premise 側が source**＝「根拠づける」の向き）
- それ以外（neutral）→ `sim ≥ RELATED_FLOOR(0.80+)` のときだけ `related`、未満は**結ばない**（e5 高ベースラインの過剰結線対策）
- θ = `VITE_NLI_THRESHOLD` 既定 **0.75**（実測: 明確な supports ペアで entailment 0.78 → 0.8 では取りこぼす。contradiction は 0.87–0.90 で余裕）
- **限界**: `elaborates`（具体化）/`reframes`（再枠組み）は NLI では原理的に判定不可（pro / WebLLM のみ）。語彙的否定（「濡れても平気」等）はスコアが閾値未満になりやすく **related に安全側降格**（実測で確認。授業では「AIの間違い探し」の学習素材にもなる）。

**実測値（M4 Max / Node・ブラウザWASMで一致確認）**:
- NLI 推論 ~9–14ms/ペア（Node）。対立ペア「長く使えない/向いている」= contradiction **0.87–0.90**（Node/ブラウザ一致）
- 無関係ペア「厚紙カット/スマホ電池」= neutral 0.85 → **e5 の 0.79 問題を NLI が解消**

### 3.5 UI

- **Home**: 2カード選択（PRO=琥珀/LITE=グレー）→ `{id, mode}` insert → navigate。
- **TopBar**: PRO/LITE バッジ（tooltip で説明）。
- **EngineStatusBar**（新規・旧「AI準備中…」ストリップを置換統合）:
  - lite: 「軽量分類モデルを取得中… n%」→「関係判定: 軽量分類（端末内NLI）」→（オプトイン時）「高精度モデル取得中 n%」→「高精度（端末内LLM）」
  - **高精度モードトグル**: `navigator.gpu` 検出時のみ表示。localStorage 永続（`takaku_high_precision`）
  - pro: 「関係判定: Claude（クラウドAI）」／quota超過時は黄バナー「上限に達しました。以降は類似度のみで結線します」
- **store**: `engineStatus` / `highPrecision` を追加。engine の `onStatus` を Room が購読して store へ橋渡し。

## 4. データベース変更（`supabase/migrations/002_room_mode_and_quota.sql`）

```sql
alter table rooms add column if not exists mode text not null default 'lite'
  check (mode in ('pro','lite'));
update rooms set mode = 'pro';               -- 既存ルームのみ従来動作を維持（1回だけ）
alter table rooms add column if not exists llm_calls integer not null default 0;
create or replace function increment_llm_calls(p_room_id text, p_max integer) ...
revoke execute on function increment_llm_calls(text, integer) from anon, authenticated;
```
`schema.sql` にも同内容を反映済み（新規構築者向け）。`useRoom` の upsert は id のみ SET のため **mode を上書きしない**。

## 5. 環境変数（追加分）

| 変数 | 位置 | 既定 | 用途 |
|---|---|---|---|
| `VITE_NLI_MODEL` | client | Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 | lite Tier2 モデル |
| `VITE_NLI_THRESHOLD` | client | 0.75 | NLI 採用しきい値（実測ベース） |
| `VITE_WEBLLM_MODEL` | client | Qwen3-1.7B-q4f16_1-MLC | lite Tier1 モデル |
| `VITE_LINK_TOPK_LITE` | client | 3 | lite の候補数（レイテンシ制御） |
| `SUPABASE_URL` | **server** | — | quota RPC 用（VITE_なし） |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | — | quota RPC 用。未設定なら fail-open |
| `LLM_MAX_CALLS_PER_ROOM` | server | 400 | pro ルーム上限（**実装済み**） |

## 6. 検証結果（実装時）

| 項目 | 結果 |
|---|---|
| ビルド/型（tsc -b strict） | ✅ 0 エラー。WebLLM は動的 import で**別チャンク**（メイン非肥大） |
| lite: NLI 型付き判定（本流 createNode 経由） | ✅ 「紙は長く使う製品に向いている」-[**contradicts** 0.87]->「長く使う製品に紙は使えない」＋rationale。赤破線で描画 |
| lite: API 呼び出しゼロ | ✅ ネットワークログに /api/classify-links なし |
| lite: 段階降格 | ✅ NLI ロード前は cosine（related）、ロード後の新規ノードから NLI |
| lite: 誤判定の安全側動作 | ✅ 語彙的否定ペアは閾値未満 → related 降格（設計どおり） |
| quota: room_required / 上限超過 | ✅ dev（上限2）で 3 回目に `quota_exceeded`。1–2回目は Anthropic まで到達 |
| Node/ブラウザ WASM の NLI スコア一致 | ✅ 対照ペアで 0.869 / 0.87（一致） |
| Supabase 断絶時の耐障害 | ✅ DNS 不可でもローカル動作へ自動降格（プレビューで観測） |
| 未検証（環境依存・ユーザー実機） | WebLLM 実ロード（WebGPU実機・~1GB DL）／migration 適用後の rooms.mode 実 DB 読み書き／本番 quota RPC |

## 7. 運用（授業・講演の手引き）

- **講演（pro）**: Anthropic の spend limit を必ず設定。Vercel に `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` を設定して quota 有効化。当日は Home から pro ルームを作成して URL/QR 配布。
- **授業（lite）**: 授業の**前日までに生徒端末で一度ルームを開かせる**（NLI 339MB を校内Wi-Fiで分散DL→キャッシュ）。HF CDN（huggingface.co / cdn.jsdelivr.net）への到達性を情報担当に確認。高精度モードは WebGPU 対応端末のみ・教員判断でオン。
- **将来候補（今回スコープ外）**: 埋め込みを `sirasagi62/ruri-v3-30m-ONNX`（int8 37MB・256次元・日本語で e5 超え）へ置換（pgvector 次元変更の migration が必要）。per-room secret による quota 強化。
