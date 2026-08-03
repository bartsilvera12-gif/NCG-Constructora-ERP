"use client";

const inputCls = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm";

export function FiltrosFecha({
  desde, hasta, onChange, extra,
}: {
  desde: string;
  hasta: string;
  onChange: (v: { desde?: string; hasta?: string }) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Desde
        <input type="date" value={desde} onChange={(e) => onChange({ desde: e.target.value })} className={inputCls} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Hasta
        <input type="date" value={hasta} onChange={(e) => onChange({ hasta: e.target.value })} className={inputCls} />
      </label>
      {extra}
    </div>
  );
}

export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function formatEur(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
