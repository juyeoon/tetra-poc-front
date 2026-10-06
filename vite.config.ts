import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 2단계(실제 API 연결)에서 EKS/ALB 주소가 정해지면 .env.local에
//   VITE_API_PROXY_TARGET=https://<alb-주소>
// 를 넣는다. 그러면 dev 서버의 /api/*가 그 주소로 프록시된다.
// TODO(미정): 아직 백엔드 주소가 없어 비워 둔다. 값이 없으면 proxy를 켜지 않는다.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET

// 루트(`/`)에 배포되므로 base는 설정하지 않는다 (CLAUDE.md §3).
export default defineConfig({
  plugins: [react()],
  server: apiProxyTarget
    ? {
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
        },
      }
    : undefined,
  build: {
    // 이미지 등 자산 폴더 이름이 겹치지 않도록 분리 (CLAUDE.md §9).
    assetsDir: 'app-assets',
    // 소스맵(.map)을 만들지 않는다. 올리면 원본 코드가 공개된다. (배포 요건 8-2)
    sourcemap: false,
  },
  test: {
    environment: 'node',
  },
})
