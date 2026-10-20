import type { NextConfig } from "next";

// El navegador solo habla con el frontend: /api/* se reenvía al backend, que puede
// escuchar únicamente en 127.0.0.1 (no se expone a internet). BACKEND_URL se lee al
// arrancar el servidor de Next.js (por defecto, el backend en la misma máquina).
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
