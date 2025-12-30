import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Impede que o app quebre ao acessar process.env no navegador
    'process.env': {} 
  }
})
