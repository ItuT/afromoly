import type { NextConfig } from 'next';

/**
 * Static export. The game is a single-page client driven by the engine now and
 * by a WebSocket in phase 3, so there is nothing to render per request.
 */
const config: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['@afromoly/engine', '@afromoly/protocol'],
  images: { unoptimized: true },
  // Next writes AGENTS.md and CLAUDE.md on build; this repo documents itself.
  agentRules: false,
};

export default config;
