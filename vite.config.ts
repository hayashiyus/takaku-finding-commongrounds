import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { classify } from './api/_classify';

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
    ],
  };
});
