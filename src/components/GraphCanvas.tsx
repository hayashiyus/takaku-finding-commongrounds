import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Panel, ReactFlow } from '@xyflow/react';
import type {
  Edge,
  Node,
  NodeChange,
  NodeMouseHandler,
  OnNodeDrag,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import NodeCard from './NodeCard';
import { useGraphStore } from '../store/graphStore';
import { RELATION_META, RELATION_ORDER } from '../lib/relations';
import { BAND_GAP_X, BAND_GAP_Y } from '../lib/cardMetrics';
import { neighborIds } from '../lib/neighbors';
import { arrangeAround } from '../lib/focusLayout';
import type { LayoutResult } from '../lib/layout';
import type { GraphNode, NodeType, Relation } from '../types';

const nodeTypes = { thought: NodeCard };

// 位置未確定ノードの素朴なバンド配置（「整える」前の初期配置）。
// 帯の間隔はカード実寸から導出する（cardMetrics）。以前は 180px 固定で、
// 長文カード（実高 200〜400px）が下の帯に食い込んでいた。
const BAND_Y: Record<NodeType, number> = {
  hypothesis: 80,
  idea: 80 + BAND_GAP_Y,
  insight: 80 + BAND_GAP_Y * 2,
  fact: 80 + BAND_GAP_Y * 3,
};
function bandPosition(node: GraphNode, indexInType: number) {
  return { x: 80 + indexInType * BAND_GAP_X, y: BAND_Y[node.type] };
}

// ズーム段階（LOD）: 遠い=俯瞰は情報を間引き、近い=精読で詳細を出す。
export type Lod = 'low' | 'mid' | 'high';

// 境界での行き来（全カード一斉切替＝点滅）を防ぐヒステリシス付きバケット
function lodWithHysteresis(zoom: number, cur: Lod): Lod {
  if (cur === 'low') return zoom < 0.55 ? 'low' : zoom < 0.9 ? 'mid' : 'high';
  if (cur === 'mid') return zoom < 0.45 ? 'low' : zoom < 0.95 ? 'mid' : 'high';
  return zoom < 0.45 ? 'low' : zoom < 0.85 ? 'mid' : 'high'; // cur === 'high'
}

export default function GraphCanvas({
  onEditNode,
  onDeleteNode,
  onRelabelEdge,
  onPositionsChange,
  measureRef,
  layoutVersion,
}: {
  onEditNode?: (id: string, text: string, type: NodeType) => void;
  onDeleteNode?: (id: string) => void;
  onRelabelEdge?: (edgeId: string, relation: Relation) => void;
  /** ドラッグ確定・「関連だけ集める」で決まった座標を親へ返す（ストア＋DBへ保存） */
  onPositionsChange?: (results: LayoutResult[]) => void;
  /**
   * 描画済みカードの実測高さを取り出す関数を親へ渡す（「整える」のレイアウト計算用）。
   * ELK に一律の想定高ではなく実寸を渡すと、短いカードの間延びが消える。
   */
  measureRef?: React.MutableRefObject<(() => Record<string, number>) | null>;
  layoutVersion?: number;
} = {}) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const showRelated = useGraphStore((s) => s.showRelated);
  const replayStep = useGraphStore((s) => s.replayStep);
  const setNodePosition = useGraphStore((s) => s.setNodePosition);
  // 編集中は画面外カードの間引き（仮想化）を止める。仮想化中に編集カードが viewport 外へ
  // 出ると unmount されて下書きが消える（モバイルはキーボード表示で viewport が縮むので現実に起きる）。
  const editingNodeId = useGraphStore((s) => s.editingNodeId);
  const [selected, setSelected] = useState<string | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<string | null>(null);
  // ズーム段階。onMove でバケット化して保持（同値 setState は React が再描画を省く＝境界跨ぎ時のみ再描画）。
  const [lod, setLod] = useState<Lod>('high');
  const rf = useRef<ReactFlowInstance | null>(null);
  const prevCount = useRef(0);
  const lastUserMove = useRef(0);
  const prevW = useRef(typeof window !== 'undefined' ? window.innerWidth : 0);
  const lodRaf = useRef(0);
  // rAF 間引きで最後に観測した zoom。スケジュール時のクロージャ値を使うと、
  // 間引かれた後続イベントの新しい zoom が捨てられ、ジェスチャ終端の LOD が古くなる。
  const lastZoom = useRef(1);

  // rAF の後始末（unmount 後の setLod を防ぐ）
  useEffect(
    () => () => {
      if (lodRaf.current) cancelAnimationFrame(lodRaf.current);
    },
    [],
  );

  // 「整える」用に、描画済みカードの実測高さを親から取れるようにする
  useEffect(() => {
    if (!measureRef) return;
    measureRef.current = () => {
      const out: Record<string, number> = {};
      for (const n of rf.current?.getNodes() ?? []) {
        if (n.measured?.height) out[n.id] = n.measured.height;
      }
      return out;
    };
    return () => {
      measureRef.current = null;
    };
  }, [measureRef]);

  // 要望#3: data に生のコールバックを入れると、親の再レンダリングで参照が変わり
  // 全ノードのオブジェクトが作り直される。ref 経由の安定ラッパを渡す。
  const editRef = useRef(onEditNode);
  const delRef = useRef(onDeleteNode);
  useEffect(() => {
    editRef.current = onEditNode;
    delRef.current = onDeleteNode;
  }, [onEditNode, onDeleteNode]);
  const stableEdit = useCallback(
    (id: string, text: string, type: NodeType) =>
      editRef.current?.(id, text, type),
    [],
  );
  const stableDelete = useCallback((id: string) => delRef.current?.(id), []);

  // タイムライン再生：先頭から replayStep 件のみ表示（null=全件）。位置は保持し hidden で制御。
  const visibleIds = useMemo(
    () =>
      replayStep == null
        ? null
        : new Set(nodes.slice(0, replayStep).map((n) => n.id)),
    [nodes, replayStep],
  );

  // 近傍ハイライト用（選択ノードと、線でつながる相手）。表示中のエッジのみで整合。
  const neighbors = useMemo(
    () => (selected ? neighborIds(selected, edges, showRelated) : null),
    [selected, edges, showRelated],
  );

  // 要望#3【主因1】: 以前はストア更新のたびに N 個のノードと data を作り直しており、
  // React Flow の参照等価チェック（@xyflow/system）が必ず失敗して measured/handleBounds が
  // リセットされ、全ノードの寸法を同期再計測（強制レイアウト）していた。
  // ノードごとに「描画に効く値」の署名を持ち、変化が無ければ同じオブジェクトを返す。
  // useRef ではなく useState で保持する: レンダー中に読み書きするため
  // （react-hooks/refs は「レンダー中に ref を触るな」を禁止する）。
  // useMemo 自体がキャッシュであるのと同じ性質のもので、同じ入力からは同じ結果になる。
  const [nodeCache] = useState(
    () => new Map<string, { key: string; node: Node }>(),
  );
  /* eslint-disable react-hooks/refs -- 意図的なレンダーキャッシュ。
     同じ入力からは必ず同じ結果になるので、StrictMode の二重レンダーでも
     中断されたレンダーでも出力は変わらない（キャッシュヒット時は同一オブジェクトを返すだけ）。
     Map はコンポーネントインスタンスごとに useState で持つため他インスタンスと共有されない。 */
  const rfNodes: Node[] = useMemo(() => {
    const counters: Record<NodeType, number> = {
      fact: 0,
      insight: 0,
      idea: 0,
      hypothesis: 0,
    };
    const cache = nodeCache;
    const seen = new Set<string>();
    const out = nodes.map((n) => {
      const pos =
        n.x != null && n.y != null
          ? { x: n.x, y: n.y }
          : bandPosition(n, counters[n.type]++);
      const hidden = visibleIds ? !visibleIds.has(n.id) : false;
      const isSelected = selected === n.id;
      const dimmed = neighbors ? !neighbors.has(n.id) : false;
      const replaying = replayStep != null;
      // 区切り文字必須: 区切り無しの連結だと x=12,y=345 と x=123,y=45 が同一キーに
      // 衝突する。本文に現れない制御文字で区切る（見えない生バイトではなく明示エスケープで書く）。
      const key = [
        n.type,
        n.text,
        n.author_name,
        n.created_at ?? '',
        n.is_final ? 1 : 0,
        pos.x,
        pos.y,
        hidden ? 1 : 0,
        isSelected ? 1 : 0,
        dimmed ? 1 : 0,
        replaying ? 1 : 0,
        lod,
      ].join('\x1f');
      const hit = cache.get(n.id);
      seen.add(n.id);
      if (hit && hit.key === key) return hit.node;
      const node: Node = {
        id: n.id,
        type: 'thought',
        position: pos,
        hidden,
        data: {
          id: n.id,
          type: n.type,
          text: n.text,
          author: n.author_name,
          createdAt: n.created_at,
          isFinal: n.is_final,
          selected: isSelected, // アプリ独自の選択状態（onNodeClick 由来）
          dimmed,
          replaying,
          lod, // ズーム段階（low=色チップ / mid=本文 / high=フル）
          onEdit: stableEdit,
          onDelete: stableDelete,
        },
      };
      cache.set(n.id, { key, node });
      return node;
    });
    for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);
    return out;
  }, [
    nodes,
    neighbors,
    visibleIds,
    selected,
    replayStep,
    lod,
    stableEdit,
    stableDelete,
    nodeCache,
  ]);
  /* eslint-enable react-hooks/refs */

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const meta = RELATION_META[e.relation];
        const isRelated = e.relation === 'related';
        const isEdgeSelected = e.id === edgeMenu;
        const touches = selected
          ? e.source_id === selected || e.target_id === selected
          : true;
        const baseOp = 0.5 + Math.min(0.5, e.confidence * 0.5);
        // 非表示条件: タイムライン外 / 既定で「関連」線 / 選択時に無関係な線は薄く消す
        const hiddenByTimeline = visibleIds
          ? !(visibleIds.has(e.source_id) && visibleIds.has(e.target_id))
          : false;
        const hiddenByRelated = isRelated && !showRelated;
        // ラベル過密対策: 高ズーム時、または選択エッジ（typed）のみ表示。それ以外は付けない。
        const showLabel =
          !isRelated && (lod === 'high' || (!!selected && touches));
        const strokeWidth = isRelated
          ? 0.8
          : touches
            ? meta.width + 0.6
            : meta.width;
        const opacity = selected
          ? touches
            ? 0.95
            : 0.1
          : isRelated
            ? Math.min(0.35, baseOp)
            : baseOp;
        return {
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: showLabel ? meta.jaLabel : undefined,
          hidden: hiddenByTimeline || hiddenByRelated,
          labelStyle: { fontSize: 11, fill: meta.color, fontWeight: 700 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          animated: selected ? touches : false,
          style: {
            stroke: meta.color,
            // 関連線は表示時も細く。typed は選択近傍を少し太く。
            strokeWidth: isEdgeSelected ? strokeWidth + 1 : strokeWidth,
            strokeDasharray: meta.dash,
            opacity: isEdgeSelected ? 1 : opacity,
          },
        };
      }),
    [edges, selected, edgeMenu, visibleIds, showRelated, lod],
  );

  // 全体表示への自動ズームは「カードが増えた時」だけ。編集・埋め込みUPDATE・削除では動かさない。
  // 要望#3: さらに「一度でも自分で画面を動かした端末では、以降まったく動かさない」。
  // 以前は8秒の猶予だったため、他人の投稿が続くと画面が繰り返し動いてカクつきの一因になっていた。
  // 投影用の端末（誰も触らない）だけが自動追従する。
  useEffect(() => {
    const inst = rf.current;
    const len = nodes.length;
    const grew = len > prevCount.current;
    prevCount.current = len;
    if (!inst || !grew) return;
    if (lastUserMove.current !== 0) return;
    const t = setTimeout(
      () => inst.fitView({ duration: 550, padding: 0.2, maxZoom: 1.2 }),
      320,
    );
    return () => clearTimeout(t);
  }, [nodes]);

  // 画面サイズ変更（スマホ↔投影、回転）で全体表示を保つ
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      const w = window.innerWidth;
      if (Math.abs(w - prevW.current) < 80) return; // 高さのみの変化（キーボード/URLバー）は無視
      prevW.current = w;
      t = setTimeout(
        () => rf.current?.fitView({ duration: 300, padding: 0.2, maxZoom: 1.2 }),
        150,
      );
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // 「整える」実行後は明示アクションなので必ず全体表示（手動操作ガードも無視）
  useEffect(() => {
    if (!layoutVersion) return;
    const t = setTimeout(
      () => rf.current?.fitView({ duration: 550, padding: 0.2, maxZoom: 1.2 }),
      320,
    );
    return () => clearTimeout(t);
  }, [layoutVersion]);

  // 要望#2:「クリックするとその関係性だけの線が表示されるが、ノード間が離れていると
  // スクロールしないと見られない。全部を1画面で見たい」
  // → 選択したカードと関係先がすべて入るところまで視点を寄せる。
  //   近傍が無い（孤立した）カードでは動かさない＝無用な画面移動を避ける。
  const neighborsRef = useRef(neighbors);
  useEffect(() => {
    neighborsRef.current = neighbors;
  }, [neighbors]);
  useEffect(() => {
    if (!selected) return;
    const inst = rf.current;
    if (!inst) return;
    const t = setTimeout(() => {
      const ids = neighborsRef.current;
      if (!ids || ids.size < 2) return; // 関係先が無いカードは視点を動かさない
      const ns = inst.getNodes().filter((n) => ids.has(n.id) && !n.hidden);
      if (ns.length < 2) return;
      // インスタンス側の getNodesBounds を使う（内部 nodeLookup を参照する正しい呼び方。
      // モジュール直 import 版は sub flow 非対応の警告を出す）。
      inst.fitBounds(inst.getNodesBounds(ns), {
        duration: 450,
        padding: 0.25,
      });
    }, 60);
    return () => clearTimeout(t);
  }, [selected]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelected((p) => (p === node.id ? null : node.id));
  }, []);

  // Phase 0: 以前は onNodesChange 未指定のため React Flow が位置変更を捨てており、
  // カードをドラッグしても次の再計算で元に戻っていた（＝手動配置が機能していなかった）。
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          setNodePosition(c.id, c.position.x, c.position.y);
        }
      }
    },
    [setNodePosition],
  );

  // ドラッグ確定時にだけ DB へ保存する（ドラッグ中の毎フレーム書き込みはしない）
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      onPositionsChange?.([
        { id: node.id, x: node.position.x, y: node.position.y },
      ]);
    },
    [onPositionsChange],
  );

  // 要望#6:「タップした際に、関連付けされたものだけ、見やすいように並び替え」
  const arrangeNeighbors = useCallback(() => {
    if (!selected) return;
    const ids = neighborsRef.current;
    if (!ids || ids.size < 2) return;
    const all = useGraphStore.getState().nodes;
    const center = all.find((n) => n.id === selected);
    if (!center) return;
    // 中心カードの座標が未確定ならまず現在の描画位置を採用する
    const rendered = rf.current?.getNodes().find((n) => n.id === selected);
    const centerWithPos: GraphNode = {
      ...center,
      x: center.x ?? rendered?.position.x ?? 0,
      y: center.y ?? rendered?.position.y ?? 0,
    };
    const around = all.filter((n) => n.id !== selected && ids.has(n.id));
    const res = arrangeAround(centerWithPos, around);
    if (res.length === 0) return;
    onPositionsChange?.([
      { id: centerWithPos.id, x: centerWithPos.x!, y: centerWithPos.y! },
      ...res,
    ]);
    setTimeout(() => {
      const inst = rf.current;
      if (!inst) return;
      const ns = inst.getNodes().filter((n) => ids.has(n.id) && !n.hidden);
      if (ns.length < 2) return;
      inst.fitBounds(inst.getNodesBounds(ns), { duration: 450, padding: 0.25 });
    }, 80);
  }, [selected, onPositionsChange]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onInit={(inst) => {
        rf.current = inst;
      }}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick}
      onEdgeClick={(_, edge) => setEdgeMenu(edge.id)}
      onPaneClick={() => {
        setSelected(null);
        setEdgeMenu(null);
      }}
      onMove={(e, vp) => {
        if (e) lastUserMove.current = Date.now();
        // 要望#3【主因5】: onMove はパン/ズームの毎フレーム発火する。LOD が境界を跨ぐと
        // 全ノードの再構築が起きるので、判定は1フレーム1回に間引く。
        // zoom は ref 経由で常に最新値を読む（クロージャ値だと間引かれたイベントの
        // zoom が捨てられ、ジェスチャ終端の LOD が1テンポ古くなる）。
        lastZoom.current = vp.zoom;
        if (lodRaf.current) return;
        lodRaf.current = requestAnimationFrame(() => {
          lodRaf.current = 0;
          setLod((cur) => lodWithHysteresis(lastZoom.current, cur));
        });
      }}
      deleteKeyCode={null}
      // 要望#3: 既定では画面外のカードも全部 DOM に存在し、再計測の対象になっていた。
      // 表示範囲のカードだけ描画する。ただし編集中は間引かない（unmount で下書きが消えるため）。
      onlyRenderVisibleElements={editingNodeId == null}
      fitView
      minZoom={0.2}
      maxZoom={2}
    >
      <Background color="#e3decf" gap={28} />
      {/* React Flow 自身の .react-flow__controls { display:flex } と同特異度で競合するため !important 修飾が必要 */}
      <Controls className="!hidden sm:!flex" />
      {selected && !edgeMenu && (
        <Panel
          position="bottom-center"
          className="bg-white border border-line rounded-md shadow-md px-3 py-2 flex items-center gap-2 max-w-[92vw]"
        >
          <span className="font-jp text-[11px] text-ink-soft whitespace-nowrap">
            選択中
          </span>
          <button
            onClick={arrangeNeighbors}
            className="font-jp text-[12px] font-bold rounded-full px-3 py-1.5 border whitespace-nowrap"
            style={{ borderColor: '#2585b0', color: '#2585b0' }}
          >
            関連だけ集める
          </button>
          <button
            onClick={() => setSelected(null)}
            className="font-jp text-[12px] text-ink-soft px-2 py-1.5"
          >
            ✕
          </button>
        </Panel>
      )}
      {edgeMenu &&
        (() => {
          const e = edges.find((x) => x.id === edgeMenu);
          if (!e) return null;
          return (
            <Panel
              position="bottom-center"
              className="bg-white border border-line rounded-md shadow-md px-3 py-2 flex items-center gap-1.5 flex-wrap max-w-[92vw]"
            >
              <span className="font-jp text-[11px] text-ink-soft whitespace-nowrap">
                線の種類:
              </span>
              {RELATION_ORDER.map((r) => {
                const m = RELATION_META[r];
                const on = e.relation === r;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      onRelabelEdge?.(e.id, r);
                      setEdgeMenu(null);
                    }}
                    className="font-jp text-[11px] font-bold rounded-full px-2.5 py-1.5 border whitespace-nowrap"
                    style={{
                      borderColor: m.color,
                      background: on ? m.color : '#fff',
                      color: on ? '#fff' : m.color,
                    }}
                  >
                    {m.jaLabel}
                  </button>
                );
              })}
              <button
                onClick={() => setEdgeMenu(null)}
                className="font-jp text-[12px] text-ink-soft px-2 py-1.5"
              >
                ✕
              </button>
            </Panel>
          );
        })()}
    </ReactFlow>
  );
}
