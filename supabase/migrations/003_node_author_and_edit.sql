-- 003: カードの編集/削除（自分のカードのみ）向けに端末IDを追加。
-- Supabase の SQL Editor で実行。冪等・後方互換（既存行は author_id = NULL）。
--
-- 所有権はクライアント側ガード（node.author_id === 端末ID）で判定する。
-- 無認証(anon)運用のため author_id はクライアント申告値であり、DB/RLS では強制しない
-- （RLS は既存どおり permissive のまま。編集/削除ボタンの出し分けはアプリ層の責務）。
-- 既存(旧)カードは author_id が NULL のため、誰の所有にもならず編集/削除ボタンは出ない。

alter table nodes add column if not exists author_id text;
