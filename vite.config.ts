import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 部署在 GitHub Pages 的 project page 底下，資源路徑必須含 repo 名稱。
// 本機開發時 base 用 '/'，否則 dev server 的路徑會對不上。
const base = process.env.NODE_ENV === 'production' ? '/moneybook/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: '記帳本',
        short_name: '記帳',
        description: '個人記帳工具',
        lang: 'zh-TW',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        // 這兩個值是啟動畫面的底色，取 index.css 的深色 surface。
        // 原本的 #0b0f14 是鷹架帶來的藍黑，App 裡沒有任何一處用到它，
        // 開啟時會先閃一下那個藍才進到真正的畫面。
        //
        // 淺色偏好的使用者仍然會看到深色啟動畫面 —— manifest 沒有辦法隨主題切換，
        // 而深色底配深色 icon 至少是協調的，反過來會是一片刺眼的白。
        background_color: '#121211',
        theme_color: '#121211',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
