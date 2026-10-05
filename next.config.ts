import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: {
    // Impede o monitor do Next de subir até a raiz do volume F:.
    root: process.cwd(),
  },
};

export default nextConfig;
