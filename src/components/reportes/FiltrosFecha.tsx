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

export function DescargarExcelBtn({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
      title="Descargar como Excel (.xlsx)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path fillRule="evenodd" d="M10 2a.75.75 0 0 1 .75.75v8.69l2.97-2.97a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.53a.75.75 0 0 1 1.06-1.06l2.97 2.97V2.75A.75.75 0 0 1 10 2Zm-6.75 13.5a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
      </svg>
      Descargar Excel
    </a>
  );
}
