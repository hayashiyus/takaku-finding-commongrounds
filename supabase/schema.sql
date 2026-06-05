-- 相関図ツール（本番版）DBスキーマ — SPEC §5
-- Supabase の SQL Editor で実行。pgvector 拡張・RLS・Realtime publication を含む。

create extension if not exists vector;

-- ルーム（チーム/セッション単位）
create table if not exists rooms (
  id           text primary key,                 -- 短いランダムID (URLに使用)
  name         text,
  final_idea   text,
  created_at   timestamptz not null default now()
);

-- ノード（事実/気づき/アイデア/仮説）
create table if not exists nodes (
  id           uuid primary key default gen_random_uuid(),
  room_id      text not null references rooms(id) on delete cascade,
  type         text not null check (type in ('fact','insight','idea','hypothesis')),
  text         text not null,
  author_name  text not null,
  embedding    vector(384),                       -- 埋め込みモデルの次元に合わせる
  x            double precision,
  y            double precision,
  is_final     boolean not null default false,
  seq          bigint generated always as identity,
  created_at   timestamptz not null default now()
);
create index if not exists nodes_room_idx on nodes (room_id);

-- エッジ（型付きの関係）
create table if not exists edges (
  id           uuid primary key default gen_random_uuid(),
  room_id      text not null references rooms(id) on delete cascade,
  source_id    uuid not null references nodes(id) on delete cascade,
  target_id    uuid not null references nodes(id) on delete cascade,
  relation     text not null check (relation in ('supports','contradicts','elaborates','reframes','related')),
  confidence   real not null default 1.0,
  rationale    text,
  created_at   timestamptz not null default now(),
  unique (room_id, source_id, target_id)          -- 冪等upsertの要
);
create index if not exists edges_room_idx on edges (room_id);

-- ===== RLS =====
-- 匿名(anon)前提・認証なし運用（SPEC §5/§16）。room_id を知る者の読み書きを許可する。
-- 注意: 認証が無いため「他ルームを読めない」厳密な分離は RLS では表現できない。
--   実運用ではアプリが常に room_id でフィルタする（行漏洩の実害は限定的）。
--   厳密分離が必要なら per-room secret を導入（今回は非ゴール）。
alter table rooms enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;

create policy "rooms_anon_all" on rooms for all using (true) with check (true);
create policy "nodes_anon_all" on nodes for all using (true) with check (true);
create policy "edges_anon_all" on edges for all using (true) with check (true);

-- ===== Realtime =====
-- nodes/edges/rooms の変更を購読できるよう publication に追加。
-- すでに追加済みの場合はこの行でエラーになることがある（その場合は無視可）。
alter publication supabase_realtime add table public.rooms, public.nodes, public.edges;
