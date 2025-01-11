import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your Next.js config here
  webpack: (config) => {
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
  serverComponentsExternalPackages: ['@react-pdf/renderer'],
  output: 'standalone',
}

export default withPayload(nextConfig)
