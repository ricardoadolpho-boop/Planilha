import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Plugin customizado para remover o bloco `<script type="importmap">` injetado pelo ambiente.
 * Este é o "anticorpo" que neutraliza a injeção automática, garantindo que as dependências
 * do `package.json` sejam usadas, prevenindo conflitos de versão (e.g., React 19 vs 18).
 */
// FIX: Removed the explicit return type ': Plugin' to fix a TypeScript error
// where the 'Plugin' type was not recognized as having a 'name' property.
// Type inference correctly handles the plugin object.
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
  // FIX: The 'define' property was removed. As noted in a comment in the original
  // file, an empty 'define' object can block the external injection of environment
  // variables, which is required for 'process.env.API_KEY' to function.
})
