import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import DisplayControls from '../components/DisplayControls';
import EngineStatusBar from '../components/EngineStatusBar';
import FocusView from '../components/FocusView';
import GraphCanvas from '../components/GraphCanvas';
import InputBar from '../components/InputBar';
import JoinDialog from '../components/JoinDialog';
import Legend from '../components/Legend';
import TopBar from '../components/TopBar';
import { useRoom } from '../hooks/useRoom';
import { useRealtimeNodes } from '../hooks/useRealtimeNodes';
import { useRealtimeEdges } from '../hooks/useRealtimeEdges';
import { usePresence } from '../hooks/usePresence';
import { computeLayout } from '../lib/layout';
import type { LayoutResult } from '../lib/layout';
import { computeElkLayout } from '../lib/elkLayout';
import { embed, loadEmbedder } from '../lib/embeddings';
import { getLinkEngine } from '../lib/linkEngine';
import { classifyLinksCosine, selectCandidates } from '../lib/linking';
import { SEED_NODES } from '../lib/seed';
import { supabase, supabaseReady } from '../lib/supabaseClient';
import { validateNodeText } from '../lib/validation';
import { useGraphStore } from '../store/graphStore';
import type {
  GraphEdge,
  GraphNode,
  NodeType,
  Relation,
  RoomMode,
} from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const toVec = (e: number[]) => `[${e.join(',')}]`;

export default function Room() {
  const { roomId = '' } = useParams();
  const myName = useGraphStore((s) => s.myName);
  const myId = useGraphStore((s) => s.myId);
  const setMyName = useGraphStore((s) => s.setMyName);
  const nodes = useGraphStore((s) => s.nodes);
  // 要望#3【主因6】: edges を購読すると、線が1本増えるたびに Room → 未メモ化の TopBar →
  // Timeline/FinalIdeaPanel/PresenceBar まで連鎖再レンダリングしていた。
  // Room 自身は edges を描画に使わない（GraphCanvas が個別に購読する）ので購読しない。
  // 必要な箇所では useGraphStore.getState().edges を読む。
  const embById = useGraphStore((s) => s.embById);
  const setNodes = useGraphStore((s) => s.setNodes);
  const setEdges = useGraphStore((s) => s.setEdges);
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const upsertEdge = useGraphStore((s) => s.upsertEdge);
  const upsertEdges = useGraphStore((s) => s.upsertEdges);
  const removeNode = useGraphStore((s) => s.removeNode);
  const removeEdgesByNode = useGraphStore((s) => s.removeEdgesByNode);
  const setEmbedding = useGraphStore((s) => s.setEmbedding);
  const setEngineStatus = useGraphStore((s) => s.setEngineStatus);
  const highPrecision = useGraphStore((s) => s.highPrecision);

  const [embReady, setEmbReady] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  // 要望#5: スマホでは相関図が読みにくいので、1件ずつ送る表示に切り替えられるようにする。
  // sm 以上（PC・投影）では相関図のみで、この切替は出さない。
  const [mobileView, setMobileView] = useState<'graph' | 'focus'>('graph');
  const embeddingBusy = useRef(false);

  const { room } = useRoom(roomId);
  useRealtimeNodes(roomId);
  useRealtimeEdges(roomId);
  usePresence(roomId, myName);

  // ルーム単位モード（rooms.mode）。Supabase 未設定＝オフライン授業は lite。
  // room 取得中（supabase あり）は null → エンジン未生成（createNode は cosine 安全側）。
  const mode: RoomMode | null = !supabaseReady
    ? 'lite'
    : room
      ? room.mode === 'pro'
        ? 'pro'
        : 'lite'
      : null;

  const engine = useMemo(
    () => (mode ? getLinkEngine(roomId, mode, { highPrecision }) : null),
    [roomId, mode, highPrecision],
  );

  useEffect(() => {
    if (!engine) return;
    const unsub = engine.onStatus((s) => {
      setEngineStatus(s);
      // 高精度モデルのロード失敗時はトグルを自動解除（死にスイッチ化を防ぐ。再ONで再試行可）
      if (s.state === 'error' && s.tier === 'webllm') {
        useGraphStore.getState().setHighPrecision(false);
      }
    });
    return () => {
      unsub();
      setEngineStatus(null);
    };
  }, [engine, setEngineStatus]);

  // バックエンド未設定時はローカルにシードを表示（§4 シード / オフライン確認用）
  useEffect(() => {
    if (!supabaseReady && useGraphStore.getState().nodes.length === 0) {
      setNodes(
        SEED_NODES.map((s, i) => ({
          id: `seed-${i}`,
          room_id: roomId,
          type: s.type,
          text: s.text,
          author_name: s.author_name,
          is_final: false,
          seq: i,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 2: 入室後に埋め込みモデルをロード（未ロードでも入力は可能）
  useEffect(() => {
    if (!myName) return;
    let on = true;
    loadEmbedder()
      .then(() => {
        if (on) setEmbReady(true);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [myName]);

  // Phase 2: 同期済みノードのうち埋め込み未算出のものを端末内で順次ベクトル化
  useEffect(() => {
    if (!embReady || embeddingBusy.current) return;
    const missing = nodes.filter((n) => !embById[n.id]);
    if (missing.length === 0) return;
    embeddingBusy.current = true;
    void (async () => {
      for (const n of missing) {
        try {
          const e = await embed(n.text);
          setEmbedding(n.id, e);
        } catch {
          /* ignore */
        }
      }
      embeddingBusy.current = false;
    })();
  }, [embReady, nodes, embById, setEmbedding]);

  // 埋め込み済みノードを現在の候補群に対して結線する共通ルーチン（createNode / editNode 共用）。
  // 既存エッジ（両向き）は再作成しない。エッジ書き込みは best-effort。
  const linkNode = useCallback(
    async (targetWithEmb: GraphNode & { embedding: number[] }) => {
      const state = useGraphStore.getState();
      const all = state.nodes
        .map((n) => ({ ...n, embedding: state.embById[n.id] }))
        .filter(
          (n): n is GraphNode & { embedding: number[] } =>
            Boolean(n.embedding) && n.id !== targetWithEmb.id,
        );
      const candidates = selectCandidates(
        targetWithEmb,
        all,
        engine?.candidateParams,
      );
      const existing = new Set(
        state.edges.flatMap((e) => [
          `${e.source_id}>${e.target_id}`,
          `${e.target_id}>${e.source_id}`,
        ]),
      );
      // room 取得前（engine 未生成）は cosine 安全側
      const proposed = engine
        ? await engine.classify(targetWithEmb, candidates)
        : classifyLinksCosine(targetWithEmb, candidates);
      // 要望#3【主因2】: 以前は提案エッジを1本ずつ upsert していたため、
      // 1カード投稿で「1(node) + k(edges)」回の全再描画と realtime 配信が
      // 全参加者の端末で発生していた。まとめて1回の更新・1回の書き込みにする。
      const fresh: GraphEdge[] = [];
      for (const p of proposed) {
        if (existing.has(`${p.source_id}>${p.target_id}`)) continue;
        existing.add(`${p.source_id}>${p.target_id}`);
        existing.add(`${p.target_id}>${p.source_id}`);
        fresh.push({
          id: uid(),
          room_id: roomId,
          source_id: p.source_id,
          target_id: p.target_id,
          relation: p.relation,
          confidence: p.confidence,
          rationale: p.rationale ?? null,
        });
      }
      if (fresh.length === 0) return;
      upsertEdges(fresh);
      if (supabase) {
        void supabase
          .from('edges')
          .upsert(
            fresh.map((e) => ({
              id: e.id,
              room_id: roomId,
              source_id: e.source_id,
              target_id: e.target_id,
              relation: e.relation,
              confidence: e.confidence,
              rationale: e.rationale,
            })),
            { onConflict: 'room_id,source_id,target_id' },
          )
          .then(
            () => {},
            () => {},
          );
      }
    },
    [engine, roomId, upsertEdges],
  );

  // 現在準備済みの最上位エンジンで全エッジを再判定。手動ラベルは保持する。
  const relinkAll = useCallback(async () => {
    const state = useGraphStore.getState();
    const embedded = state.nodes
      .map((n) => ({ ...n, embedding: state.embById[n.id] }))
      .filter(
        (n): n is GraphNode & { embedding: number[] } =>
          Boolean(n.embedding),
      );
    if (embedded.length < 2) return;
    if (
      !window.confirm(
        '現在のAIで全ての線を判定し直します（手動ラベルの線は保持されます）。よろしいですか？',
      )
    )
      return;

    setRelinking(true);
    try {
      const manual = state.edges.filter((e) =>
        e.rationale?.startsWith('手動'),
      );
      const removedIds = state.edges
        .filter((e) => !e.rationale?.startsWith('手動'))
        .map((e) => e.id);
      const pairSeen = new Set(
        manual.flatMap((e) => [
          `${e.source_id}>${e.target_id}`,
          `${e.target_id}>${e.source_id}`,
        ]),
      );
      const next: GraphEdge[] = [...manual];
      const sorted = embedded.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

      for (const target of sorted) {
        const others = sorted.filter((n) => n.id !== target.id);
        const candidates = selectCandidates(
          target,
          others,
          engine?.candidateParams,
        );
        const proposed = engine
          ? await engine.classify(target, candidates)
          : classifyLinksCosine(target, candidates);
        for (const p of proposed) {
          const forward = `${p.source_id}>${p.target_id}`;
          const reverse = `${p.target_id}>${p.source_id}`;
          if (pairSeen.has(forward) || pairSeen.has(reverse)) continue;
          pairSeen.add(forward);
          pairSeen.add(reverse);
          next.push({
            id: uid(),
            room_id: roomId,
            source_id: p.source_id,
            target_id: p.target_id,
            relation: p.relation,
            confidence: p.confidence,
            rationale: p.rationale ?? null,
          });
        }
      }

      setEdges(next);
      if (supabase) {
        for (let i = 0; i < removedIds.length; i += 50) {
          await supabase
            .from('edges')
            .delete()
            .in('id', removedIds.slice(i, i + 50));
        }
        const generated = next.slice(manual.length);
        for (let i = 0; i < generated.length; i += 50) {
          const rows = generated.slice(i, i + 50).map((e) => ({
            id: e.id,
            room_id: e.room_id,
            source_id: e.source_id,
            target_id: e.target_id,
            relation: e.relation,
            confidence: e.confidence,
            rationale: e.rationale,
          }));
          await supabase
            .from('edges')
            .upsert(rows, { onConflict: 'room_id,source_id,target_id' });
        }
      }
    } finally {
      setRelinking(false);
    }
  }, [engine, roomId, setEdges]);

  const relabelEdge = useCallback(
    async (edgeId: string, relation: Relation) => {
      const edge = useGraphStore
        .getState()
        .edges.find((e) => e.id === edgeId);
      if (!edge || edge.relation === relation) return;
      const relabeled: GraphEdge = {
        ...edge,
        relation,
        confidence: 1,
        rationale: '手動ラベル',
      };
      upsertEdge(relabeled);
      if (supabase) {
        await supabase
          .from('edges')
          .update({ relation, confidence: 1, rationale: '手動ラベル' })
          .eq('id', edgeId);
      }
    },
    [upsertEdge],
  );

  // カードの本文＋種類を編集 → 再ベクトル化 → 旧エッジ剪定 → 再結線。
  // 誰のカードでも編集できる（委員会要望・2026-07-20。author_id は投稿者表示のためだけに残す）。
  const editNode = useCallback(
    async (id: string, newText: string, newType: NodeType) => {
      // 要望#7: 編集経路にも下限チェックを入れる（NodeCard 側でも弾くが最後の砦）。
      if (!validateNodeText(newText).ok) return;
      const text = newText.trim();
      const node = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (!node) return;
      const updated: GraphNode = { ...node, text, type: newType };
      upsertNode(updated); // 楽観
      if (supabase) {
        await supabase
          .from('nodes')
          .update({ text, type: newType })
          .eq('id', id); // UPDATE は他端末へ伝播
      }
      // 再ベクトル化（失敗時は本文/種類の更新のみ・既存の線は温存）
      let emb: number[];
      try {
        emb = await embed(text);
      } catch {
        return;
      }
      setEmbedding(id, emb);
      if (supabase) {
        void supabase
          .from('nodes')
          .update({ embedding: toVec(emb) })
          .eq('id', id)
          .then(
            () => {},
            () => {},
          );
      }
      // 旧エッジ剪定（楽観＋DB）。DB削除を await してから再結線し、新エッジが消されるのを防ぐ。
      removeEdgesByNode(id);
      if (supabase) {
        await supabase
          .from('edges')
          .delete()
          .or(`source_id.eq.${id},target_id.eq.${id}`);
      }
      await linkNode({ ...updated, embedding: emb });
    },
    [upsertNode, setEmbedding, removeEdgesByNode, linkNode],
  );

  // カードを削除（誰でも可。ノード＋接続エッジ。DBはカスケードでエッジ削除）。
  const deleteNode = useCallback(
    async (id: string) => {
      const node = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (!node) return;
      removeNode(id); // 楽観（ノード＋接続エッジをストアから除去）
      if (supabase) {
        await supabase.from('nodes').delete().eq('id', id);
      }
    },
    [removeNode],
  );

  // Phase 0: 決まった座標をストア＋DB に反映する。
  // 以前は「整える」の結果がストアにしか無く、リロードで消え、他端末にも伝わらなかった。
  // ドラッグ確定・「関連だけ集める」・「整える」の共通の保存経路。
  const savePositions = useCallback(
    async (results: LayoutResult[]) => {
      if (results.length === 0) return;
      const map = new Map(results.map((r) => [r.id, r] as const));
      const cur = useGraphStore.getState().nodes;
      setNodes(
        cur.map((n) => {
          const p = map.get(n.id);
          return p ? { ...n, x: p.x, y: p.y } : n;
        }),
      );
      if (!supabase) return;
      const db = supabase;
      // 1行ずつの UPDATE を 25 件並列 × チャンクで流す。
      // upsert 一括だと本文まで上書きしてしまい、同時編集を踏み潰すため使わない。
      for (let i = 0; i < results.length; i += 25) {
        await Promise.all(
          results.slice(i, i + 25).map((r) =>
            db
              .from('nodes')
              .update({ x: r.x, y: r.y })
              .eq('id', r.id)
              .then(
                () => {},
                () => {},
              ),
          ),
        );
      }
    },
    [setNodes],
  );

  const createNode = useCallback(
    async (type: NodeType, text: string) => {
      // 要望#7: 短すぎる入力はここで止める（以前は空文字チェックすら InputBar 側だけだった）。
      const check = validateNodeText(text);
      if (!check.ok) return;
      const body = text.trim();
      const id = uid();
      const node: GraphNode = {
        id,
        room_id: roomId,
        type,
        text: body,
        author_name: myName,
        author_id: myId,
        is_final: false,
        created_at: new Date().toISOString(),
      };
      upsertNode(node); // 楽観的更新（§6）
      if (supabase) {
        let insertError: unknown;
        try {
          const { error } = await supabase.from('nodes').insert({
            id,
            room_id: roomId,
            type,
            text: body,
            author_name: myName,
            author_id: myId,
          });
          insertError = error;
        } catch (error) {
          insertError = error;
        }
        if (insertError) {
          console.warn(
            'nodes insert failed, retrying without author_id',
            insertError,
          );
          await supabase.from('nodes').insert({
            id,
            room_id: roomId,
            type,
            text: body,
            author_name: myName,
          });
        }
      }

      // 端末内で埋め込み生成（モデル未ロードなら自動でロード完了を待つ）
      let emb: number[];
      try {
        emb = await embed(body);
      } catch {
        return; // 埋め込み不可なら線は引かない（§7.2 候補ゼロ＝孤立を許容）
      }
      setEmbedding(id, emb);
      if (supabase) {
        // pgvector 保存（任意・best-effort / §5）
        void supabase
          .from('nodes')
          .update({ embedding: toVec(emb) })
          .eq('id', id)
          .then(
            () => {},
            () => {},
          );
      }

      // 候補選定 → LinkEngine（pro=クラウドLLM / lite=webllm→nli→cosine）
      await linkNode({ ...node, embedding: emb });
    },
    [roomId, myName, myId, upsertNode, setEmbedding, linkNode],
  );

  const tidy = useCallback(async () => {
    if (tidying) return; // 多重起動防止
    setTidying(true);
    try {
      const state = useGraphStore.getState();
      let res: LayoutResult[];
      try {
        // クラスタ配置＋交差最小化（elkjs・動的ロード）。
        // 要望#4: 帯の中の並び順を埋め込みの類似度で決め、似た案が隣り合うようにする。
        res = await computeElkLayout(state.nodes, state.edges, state.embById);
      } catch {
        // 失敗時は従来の d3-force にフォールバック
        res = computeLayout(state.nodes, state.edges);
      }
      // Phase 0: ストアだけでなく DB にも保存する（リロード・他端末で消えないように）
      await savePositions(res);
      setLayoutVersion((v) => v + 1);
    } finally {
      setTidying(false);
    }
  }, [tidying, savePositions]);

  // dev専用の検証フック（本番ビルドでは import.meta.env.DEV=false で除去される）
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/immutability -- dev console から検証するための意図的な window 拡張
    (window as unknown as { __room?: unknown }).__room = {
      createNode,
      getState: useGraphStore.getState,
      embReady,
      mode,
      engineTier: engine?.tier ?? null,
      relinkAll,
      relabelEdge,
    };
  }

  // 表示名の入力は最後に判定する（上のフックとコールバック定義を条件付きにしないため）
  if (!myName) return <JoinDialog onJoin={setMyName} />;

  return (
    <div className="h-full flex flex-col">
      <TopBar roomId={roomId} mode={mode} onTidy={tidy} tidying={tidying} />
      {!supabaseReady && (
        <div className="bg-yellow-100 text-yellow-900 font-jp text-[12px] px-4 py-1.5 border-b border-yellow-200">
          Supabase 未設定：ローカル表示（同期なし）。`takaku-app/.env.local` に URL / ANON_KEY を設定すると複数端末同期が有効になります。
        </div>
      )}
      {/* 要望#5: スマホのみ「相関図 / 1件ずつ」の切替。sm 以上では相関図固定。 */}
      <div className="sm:hidden flex gap-1 px-3 py-1.5 border-b border-line bg-white/80">
        {(
          [
            ['graph', '相関図'],
            ['focus', '1件ずつ'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setMobileView(v)}
            className="font-jp text-[12px] font-bold rounded-full px-3 py-1.5 border"
            style={{
              borderColor: '#2585b0',
              background: mobileView === v ? '#2585b0' : '#fff',
              color: mobileView === v ? '#fff' : '#2585b0',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-h-0">
        {/* カード送りビューはスマホのみ。sm 以上では常に相関図を出す。 */}
        <div
          className={
            mobileView === 'focus' ? 'hidden sm:block h-full' : 'h-full'
          }
        >
          <Legend />
          <DisplayControls />
          <GraphCanvas
            onEditNode={editNode}
            onDeleteNode={deleteNode}
            onRelabelEdge={relabelEdge}
            onPositionsChange={savePositions}
            layoutVersion={layoutVersion}
          />
        </div>
        {mobileView === 'focus' && (
          <div className="sm:hidden absolute inset-0">
            <FocusView onDeleteNode={deleteNode} />
          </div>
        )}
      </div>
      {mode && (
        <EngineStatusBar
          mode={mode}
          embReady={embReady}
          onRelink={relinkAll}
          relinking={relinking}
        />
      )}
      <InputBar onSubmit={createNode} />
    </div>
  );
}
