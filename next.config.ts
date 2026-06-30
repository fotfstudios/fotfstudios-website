import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Redirige las URLs del sitio antiguo ("coming soon" con locale /en) al home,
  // para que Google consolide la entrada obsoleta en vez de dejarla en 404.
  async redirects() {
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
