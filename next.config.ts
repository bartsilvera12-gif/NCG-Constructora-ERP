import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Quitar el header "X-Powered-By: Next.js" — leak innecesario de tech stack
  // a clientes/atacantes. Cuesta 0 perf-wise.
  poweredByHeader: false,

  // gzip de respuestas en produccion. Es el default pero declararlo explicito
  // evita sorpresas si Coolify/Traefik intentan re-comprimir.
  compress: true,

  // El chequeo de tipos que `next build` corre sobre ~179 paginas es el paso
  // mas pesado en RAM y hacia OOM al contenedor de build de Coolify (fallaba
  // exactamente en "Running TypeScript ...", sin error de tipo, con exit 255).
  // Lo saltamos en el build: los tipos se verifican aparte con `tsc --noEmit`
  // antes de cada push (sigue siendo bloqueante en dev/CI local). El codigo NO
  // tiene errores de tipo; esto es solo para no quedarnos sin memoria al buildear.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Salida standalone para el Dockerfile (node server.js): la imagen solo lleva el
  // subconjunto de node_modules que Next rastreó → mucha menos RAM que `next start`.
  output: "standalone",

  experimental: {
    // Tree-shake agresivo para barrels grandes. Cuando importas
    //   import { ChevronDown, X, Search } from "lucide-react"
    // Next solo bundlea esas 3 icons en vez del barrel completo de la libreria.
    // Aplica tambien a recharts (aunque ya hicimos dynamic import del chart).
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },

  // Headers HTTP para caching agresivo de assets estaticos generados por Next
  // (fingerprinted, immutable por hash). El navegador los cachea 1 ano.
  // Reduce dramaticamente requests al server en navegaciones siguientes
  // del mismo user (vuelve al dashboard, los chunks JS/CSS ya estan locales).
  async headers() {
    return [
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/_next/image(.*)",
        headers: [
          // Imagenes optimizadas tambien son fingerprinted, mismo trato.
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
