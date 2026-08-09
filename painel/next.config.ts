import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Trava a raiz nesta pasta. Sem isso, o Turbopack sobe procurando
    // lockfile e acaba adotando a pasta do usuario como raiz do projeto.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
