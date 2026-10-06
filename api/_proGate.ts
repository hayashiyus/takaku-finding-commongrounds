// 本番LLM版（PRO）の有効化スイッチ。classify-links.ts / synthesize.ts / vite.config.ts（dev）共通。
//
// PRO_ENABLED=1 のときだけクラウドLLMを呼ぶ。未設定・それ以外の値はすべて停止（fail-closed）。
// エンドポイントは無認証で公開URLから誰でも叩けるため、ルーム単位 quota（ルームは誰でも
// 作れる）では総額の歯止めにならない。PRO を使わない期間はこの門で LLM 呼び出しを断つ。
export function isProEnabled(value: string | undefined): boolean {
  return value === '1';
}
