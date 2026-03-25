/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@qod/shared'],
};
module.exports = nextConfig;
