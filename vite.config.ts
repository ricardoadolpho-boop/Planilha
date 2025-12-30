import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Plugin customizado para remover o bloco `<script type="importmap">` injetado pelo ambiente.
 * Este é o "anticorpo" que neutraliza a injeção automática, garantindo que as dependências
 * do `package.json` sejam usadas, prevenindo conflitos de versão (e.g., React 19 vs 18).
 */
function removeImportmapPlugin() {
  return {
    name: 'remove-importmap-plugin',
    // O hook `transformIndexHtml` é executado logo antes do HTML ser enviado ao navegador.
    transformIndexHtml(html: string) {
      // Usa uma expressão regular para encontrar e remover todo o bloco do script.
      // A flag 's' permite que '.' corresponda a novas linhas, capturando o bloco inteiro.
      return html.replace(/<script type="importmap">.*?<\/script>/s, '');
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // Adiciona nosso plugin customizado à lista, junto com o plugin do React.
  plugins: [react(), removeImportmapPlugin()],
  // Adiciona a propriedade `define` para expor a variável de ambiente da API Key para o código do cliente.
  // O Vite substituirá `process.env.API_KEY` pelo valor real durante o processo de build/dev.
  // Isso é essencial para evitar um erro de "process is not defined" no navegador.
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
})
