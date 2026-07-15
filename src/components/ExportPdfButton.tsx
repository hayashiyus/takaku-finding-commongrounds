// PDF出力ボタン（SPEC §9.3）
export default function ExportPdfButton({ roomId }: { roomId: string }) {
  const run = () => {
    window.open(`/r/${roomId}/print`, '_blank');
  };
  return (
    <button
      onClick={run}
      className="font-jp text-[12px] border border-ink rounded-full px-3 py-1 hover:opacity-70"
    >
      PDF出力
    </button>
  );
}
