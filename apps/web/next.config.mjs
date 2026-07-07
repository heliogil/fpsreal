/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  experimental: { typedRoutes: false },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default config
