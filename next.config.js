/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@coinbase/agentkit',
      '@coinbase/agentkit-langchain',
      '@coinbase/cdp-sdk',
      'langchain',
      '@langchain/core',
      '@langchain/langgraph',
      '@langchain/openai',
    ],
  },
};

module.exports = nextConfig;
