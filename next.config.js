/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@coinbase/agentkit', '@coinbase/agentkit-langchain'],
};

module.exports = nextConfig;
