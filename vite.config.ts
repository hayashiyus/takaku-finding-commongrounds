import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { classify } from './api/_classify';

// dev/prod parity: 本番は /api/classify-links が Vercel Function。
// dev では同じ classify() を vite ミドルウェアで提供する（LLM_API_KEY は
// loadEnv 経由でサーバ側のみ参照し、クライアントバンドルには含めない）。
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
              void classify(JSON.parse(body || '{}'), linkEnv)
                .then((out) => {
                  res.setHeader('content-type', 'application/json');
                  res.end(JSON.stringify(out));
                })
                .catch((e) => {
                  res.setHeader('content-type', 'application/json');
                  res.end(
                    JSON.stringify({ links: [], error: String(e?.message || e) }),
                  );
                });
            });
          });
        },
      },
    ],
  };
});
