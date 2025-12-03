import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
 
const nextConfig:  NextConfig = {
  // Your Next.js config here
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  output: 'standalone',
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
