/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Mark 'ssh2' as external for server-side builds only
    // This prevents Webpack from trying to bundle its native/optional dependencies
    if (isServer) {
      config.externals = [...config.externals, 'ssh2'];
    }

    // Important: return the modified config
    return config;
  },
};

export default nextConfig;
