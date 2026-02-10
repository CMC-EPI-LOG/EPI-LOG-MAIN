import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const platform = env.VITE_PLATFORM || env.NEXT_PUBLIC_PLATFORM || 'TOSS'

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    define: {
      // Allow policy toggles to use the same env accessor as the Next.js app.
      'process.env.NEXT_PUBLIC_PLATFORM': JSON.stringify(platform),
    },
  }
})
