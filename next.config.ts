import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Session 3.0：standalone output 让 Next.js build 出一个最小化的 server.js
  // Docker 镜像可以直接跑它，不用带完整 node_modules
  output: "standalone",
};

export default nextConfig;