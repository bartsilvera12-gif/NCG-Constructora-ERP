"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";

const STANDALONE_ROUTES = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = pathname && STANDALONE_ROUTES.includes(pathname);

  if (isStandalone) {
    return <>{children}</>;
  }

  return (
    <div id="neura-app-shell" className="flex h-svh min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar usa useSearchParams() para deep-links al panel de filtros.
          En Next 16 hay que envolverlo en Suspense para que el prerender no
          dispare CSR-bailout en paginas estaticas (/404, /configuracion/colas). */}
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div id="neura-main-column" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main
          id="neura-main-content"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
