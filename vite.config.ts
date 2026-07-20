import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { classify } from './api/_classify';
import { synthesizeStream } from './api/_synthesize';

// dev/prod parity: 本番は /api/classify-links が Vercel Function。
// dev では同じ classify() を vite ミドルウェアで提供する（LLM_API_KEY は
// loadEnv 経由でサーバ側のみ参照し、クライアントバンドルには含めない）。
// quota（ルーム単位上限）も本番と同じ挙動をプロセス内カウントで再現する。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const linkEnv = {
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    provider: env.LLM_PROVIDER,
    threshold: env.LINK_CONFIDENCE_THRESHOLD
      ? Number(env.LINK_CONFIDENCE_THRESHOLD)
      : 0.6,
  };
  const maxCalls = Number(env.LLM_MAX_CALLS_PER_ROOM ?? 400);
  const devQuota = new Map<string, number>(); // roomId -> calls（dev用・非永続）

  return {
    plugins: [
      react(),
      {
        name: 'dev-api-classify-links',
        configureServer(server) {
          server.middlewares.use('/api/classify-links', (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('{}');
              return;
            }
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
              res.setHeader('content-type', 'application/json');
              let parsed: { room_id?: unknown } = {};
              try {
                parsed = JSON.parse(body || '{}');
              } catch {
                res.end(JSON.stringify({ links: [], error: 'bad json' }));
                return;
              }
              const roomId =
                typeof parsed.room_id === 'string' ? parsed.room_id : undefined;
              if (!roomId) {
                res.end(JSON.stringify({ links: [], error: 'room_required' }));
                return;
              }
              const n = (devQuota.get(roomId) ?? 0) + 1;
              devQuota.set(roomId, n);
              if (n > maxCalls) {
                res.end(
                  JSON.stringify({ links: [], error: 'quota_exceeded' }),
                );
                return;
              }
              void classify(parsed as Parameters<typeof classify>[0], linkEnv)
                .then((out) => {
                  res.end(JSON.stringify(out));
                })
                .catch((e) => {
                  res.end(
                    JSON.stringify({
                      links: [],
                      error: String(e?.message || e),
                    }),
                  );
                });
            });
          });
        },
      },
      {
        name: 'dev-api-synthesize',
        configureServer(server) {
          server.middlewares.use('/api/synthesize', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('{}');
              return;
            }

            const body = await new Promise<string>((resolve) => {
              let input = '';
              req.on('data', (chunk) => (input += chunk));
              req.on('end', () => resolve(input));
            });
            let parsed: {
              room_id?: unknown;
              nodes?: unknown;
              edges?: unknown;
            };
            try {
              parsed = JSON.parse(body || '{}') as typeof parsed;
            } catch {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'bad_json' }));
              return;
            }

            const roomId =
              typeof parsed.room_id === 'string'
                ? parsed.room_id
                : undefined;
            if (!roomId) {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'room_required' }));
              return;
            }
            const n = (devQuota.get(roomId) ?? 0) + 1;
            devQuota.set(roomId, n);
            if (n > maxCalls) {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'quota_exceeded' }));
              return;
            }

            if (env.SYNTH_MOCK === '1') {
              const canned = `【最終案】
やさしさを選べる、循環型プロダクト
環境負荷を抑える素材を土台に、誰でも迷わず使える設計と必要に応じて選べる補助機能を組み合わせます。日常の便利さが、そのまま持続可能な行動につながる仕組みです。
【対立の止揚】
環境配慮 ⇄ 使いやすさ → 止揚: 利用場面に応じて機能を段階化し、無理なく環境配慮を続けられる体験にする
【根拠】
・簡単であるほど参加が広がるという気づき
・資源を長く使う仕組みが必要という事実`;
              const chars = Array.from(canned);
              const chunkSize = Math.ceil(chars.length / 8);
              res.setHeader('content-type', 'text/plain; charset=utf-8');
              for (let i = 0; i < 8; i += 1) {
                res.write(
                  chars.slice(i * chunkSize, (i + 1) * chunkSize).join(''),
                );
                if (i < 7) {
                  await new Promise<void>((resolve) =>
                    setTimeout(resolve, 120),
                  );
                }
              }
              res.end();
              return;
            }

            type SynthesizeInput = Parameters<typeof synthesizeStream>[0];
            type SynthNode = SynthesizeInput['nodes'][number];
            type SynthEdge = SynthesizeInput['edges'][number];
            const nodeTypes = [
              'fact',
              'insight',
              'idea',
              'hypothesis',
            ] as const;
            const nodes = (Array.isArray(parsed.nodes) ? parsed.nodes : [])
              .slice(0, 200)
              .map((raw): SynthNode => {
                const node =
                  raw && typeof raw === 'object'
                    ? (raw as Record<string, unknown>)
                    : {};
                const type = nodeTypes.includes(node.type as SynthNode['type'])
                  ? (node.type as SynthNode['type'])
                  : 'fact';
                return {
                  id: String(node.id ?? ''),
                  type,
                  text: String(node.text ?? '').slice(0, 400),
                };
              });
            const edges = (Array.isArray(parsed.edges) ? parsed.edges : [])
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
            if (nodes.length === 0) {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'no_nodes' }));
              return;
            }

            const gen = synthesizeStream(
              { room_id: roomId, nodes, edges },
              {
                apiKey: env.LLM_API_KEY,
                // dev/prod parity: FINAL IDEA統合のみ SYNTH_MODEL で上書き可
                model: env.SYNTH_MODEL || env.LLM_MODEL,
                provider: env.LLM_PROVIDER,
                maxTokens: (() => {
                  const n = Number(env.SYNTH_MAX_TOKENS);
                  return Number.isFinite(n) && n > 0 ? n : undefined;
                })(),
              },
            );
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            let first: IteratorResult<string>;
            try {
              first = await gen.next();
            } catch (e) {
              console.error('[synthesize] upstream error:', e);
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'llm_error' }));
              return;
            }

            if (!first.done) res.write(first.value);
            try {
              for await (const chunk of gen) {
                res.write(chunk);
              }
            } catch (e) {
              console.error('[synthesize] stream error:', e);
              res.write('\n\n⚠ 生成が中断されました。もう一度お試しください。');
            } finally {
              res.end();
            }
          });
        },
      },
    ],
  };
});
