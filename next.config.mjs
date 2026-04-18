/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['onnxruntime-node', 'sharp', 'onnxruntime-web'],
  turbopack: {}
};

export default nextConfig;
