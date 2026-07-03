-- 002: 2モード化（pro/lite）＋ pro のLLM呼び出し上限（quota）
-- Supabase ダッシュボード → SQL Editor で実行してください。冪等（再実行可）。

-- 1)+2) mode 列。既存行は add 時の default で 'pro' にバックフィル（従来動作の維持）、
--       その後 default を 'lite' に切替（以降の新規行のみ lite）。
--       再実行時は add がスキップされるため lite ルームが pro に反転しない（冪等）。
--       default 'lite' が実効的な保護: URL直打ちで自動生成される部屋は LLM を使えない。
--       pro は Home の「本番LLM版」カードからの明示 insert のみ。
alter table rooms add column if not exists mode text not null default 'pro'
  check (mode in ('pro','lite'));
alter table rooms alter column mode set default 'lite';

-- 3) LLM呼び出しカウンタ（ルーム単位）
alter table rooms add column if not exists llm_calls integer not null default 0;

-- 4) 原子的インクリメント＋上限チェック RPC。
--    security definer: RLS/権限に依らず DB 側で一貫制御。
--    mode='pro' の行のみ加算可 → lite ルームの room_id で叩いても false。
create or replace function increment_llm_calls(p_room_id text, p_max integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare ok boolean;
begin
  update rooms set llm_calls = llm_calls + 1
   where id = p_room_id and mode = 'pro' and llm_calls < p_max
  returning true into ok;
  return coalesce(ok, false);  -- 部屋が無い / lite / 上限到達 → false
end $$;

-- anon からの直接実行を遮断（Edge Function の service_role のみが呼ぶ）。
-- 注意: PostgreSQL は関数作成時に EXECUTE を PUBLIC へ既定付与するため、
--       public を含めて revoke しないと anon が実行できてしまう。
revoke execute on function increment_llm_calls(text, integer) from public, anon, authenticated;

-- 5) quota 関連列のクライアント改ざん防止（列レベル権限）。
--    anon が REST 経由で mode 昇格や llm_calls リセットを行えないようにする。
--    id は useRoom の upsert（ON CONFLICT (id) DO UPDATE SET id）に必要。
--    final_idea は FINAL IDEA パネル、name は将来用。
revoke update on table rooms from anon, authenticated;
grant update (id, name, final_idea) on table rooms to anon, authenticated;
