import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // O plugin do React é mantido para transformar JSX e fornecer HMR.
  plugins: [react()],
  // A propriedade `define` é crucial. Ela substitui `process.env.API_KEY` no código
  // do cliente pelo valor real da variável de ambiente durante a compilação.
  // Isso resolve o erro "process is not defined" no navegador ao usar a API Gemini.
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
})
