import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Gestion-cross";
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(isGitHubPages
    ? {
        output: "export",
        basePath,
        assetPrefix: basePath,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
