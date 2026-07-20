// Vercel Function（Edge）— FINAL IDEA のAI統合案をストリーミング生成（対立の止揚）。APIキーはサーバ側 process.env のみで参照。クライアントへは出さない。
import { synthesizeStream } from './_synthesize';
import { checkQuota } from './_quota';

export const config = { runtime: 'edge' };

function json(d: unknown, s = 200): Response {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json' },
  });
}

type SynthesizeInput = Parameters<typeof synthesizeStream>[0];
type SynthNode = SynthesizeInput['nodes'][number];
type SynthEdge = SynthesizeInput['edges'][number];
const NODE_TYPES = ['fact', 'insight', 'idea', 'hypothesis'] as const;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    let body: { room_id?: unknown; nodes?: unknown; edges?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: 'room_required' });
    }

    const roomId =
      typeof body.room_id === 'string' ? body.room_id : undefined;
    if (!roomId) return json({ error: 'room_required' });

    const preClampedNodes = (Array.isArray(body.nodes) ? body.nodes : [])
      .slice(0, 200)
      .map((raw): SynthNode => {
        const node =
          raw && typeof raw === 'object'
            ? (raw as Record<string, unknown>)
            : {};
        const type = NODE_TYPES.includes(node.type as SynthNode['type'])
          ? (node.type as SynthNode['type'])
          : 'fact';
        return {
          id: String(node.id ?? ''),
          type,
          text: String(node.text ?? '').slice(0, 400),
        };
      });
    let totalChars = 0;
    const clampedNodes: SynthNode[] = [];
    for (const node of preClampedNodes) {
      if (totalChars >= 24000) break;
      totalChars += node.text.length;
      clampedNodes.push(node);
    }
    const clampedEdges = (Array.isArray(body.edges) ? body.edges : [])
      .slice(0, 400)
      .map((raw): SynthEdge => {
        const edge =
          raw && typeof raw === 'object'
            ? (raw as Record<string, unknown>)
            : {};
        return {
          source_id: String(edge.source_id ?? ''),
          target_id: String(edge.target_id ?? ''),
          relation: String(edge.relation ?? ''),
        };
      });
    if (clampedNodes.length === 0) return json({ error: 'no_nodes' });
    if (!(await checkQuota(roomId)))
      return json({ error: 'quota_exceeded' });

    const n = Number(process.env.SYNTH_MAX_TOKENS);
    const maxTokens = Number.isFinite(n) && n > 0 ? n : undefined;
    const gen = synthesizeStream(
      { room_id: roomId, nodes: clampedNodes, edges: clampedEdges },
      {
        apiKey: process.env.LLM_API_KEY,
        // FINAL IDEA統合のみ SYNTH_MODEL で上書き可（例: classify=Haiku / 統合=Fable-5）
        model: process.env.SYNTH_MODEL || process.env.LLM_MODEL,
        provider: process.env.LLM_PROVIDER,
        maxTokens,
      },
    );
    const encoder = new TextEncoder();
    const INTERRUPTED_MSG =
      '\n\n⚠ 生成が中断されました。もう一度お試しください。';

    const firstPromise = gen.next();
    const first = await Promise.race([
      firstPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);

    if (first === null) {
      // 15秒以内に最初のチャンクが来なかった（Fable系モデルのthinking長期化を想定）。
      // Edge Functionの応答タイムアウト(25秒)を避けるため、ここで即座にストリーミングResponseを返し、
      // start() 内で保留中の firstPromise を待つ。
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const f = await firstPromise;
            if (!f.done) controller.enqueue(encoder.encode(f.value));
            for await (const chunk of gen) {
              controller.enqueue(encoder.encode(chunk));
            }
          } catch (e) {
            console.error('[synthesize] stream error:', e);
            controller.enqueue(encoder.encode(INTERRUPTED_MSG));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        try {
          for await (const chunk of gen) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (e) {
          console.error('[synthesize] stream error:', e);
          controller.enqueue(encoder.encode(INTERRUPTED_MSG));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[synthesize] upstream error:', e);
    return json({ error: 'llm_error' });
  }
}
