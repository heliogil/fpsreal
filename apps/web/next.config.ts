import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: { typedRoutes: false },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default config