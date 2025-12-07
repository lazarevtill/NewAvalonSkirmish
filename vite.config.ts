import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repository name on GitHub
const repoName = 'NewAvalonSkirmish'

export default defineConfig(({ command }) => {
  if (command === 'build') {
    // This configuration is used when running 'npm run build'
    return {
      plugins: [react()],
      base: `/${repoName}/`, // Base path for GitHub Pages
      build: {
        outDir: 'docs',      // Output folder for GitHub Pages
        sourcemap: false,    // Disable sourcemaps in production for security
        minify: 'esbuild',   // Use esbuild for faster minification
        target: 'es2020',    // Target modern browsers
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom']
            }
          }
        }
      },
    }
  } else {
    // This configuration is used when running 'npm run dev' (local development)
    return {
      plugins: [react()],
      base: '/', // Locally work from root localhost
      server: {
        port: 5173,
        strictPort: false,
        host: 'localhost'
      }
    }
  }
})