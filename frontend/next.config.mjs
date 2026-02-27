/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Permite que el build de producción continúe aunque haya errores de tipos
    ignoreBuildErrors: true,
  },
  eslint: {
    // No bloquear el build por errores de ESLint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
