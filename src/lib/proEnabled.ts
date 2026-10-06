// ビルド時に vite.config.ts の define で真偽値に置き換わる（PRO_ENABLED=1 のときだけ true）。
// 画面側の扱いを決めるだけで、課金の歯止めはサーバ側の門（api/_proGate.ts）が担う。
declare const __PRO_ENABLED__: boolean;

export const PRO_ENABLED: boolean = __PRO_ENABLED__;
