import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Optional: set GITHUB_TOKEN in your env to raise the rate limit from 60/hr to
// 5000/hr, which lets the app poll every few seconds for a near-live feed.
// The token is attached server-side by the dev proxy, so it never reaches the
// browser. Run e.g.  GITHUB_TOKEN=ghp_xxx npm run dev
const token = process.env.GITHUB_TOKEN

export default defineConfig({
  // Relative asset paths so the build works whether it's served from a domain
  // root or a GitHub Pages project subpath (username.github.io/repo/).
  base: './',
  plugins: [vue()],
  server: {
    // Proxy GitHub API so we avoid CORS/rate weirdness in dev and can attach a
    // token server-side.
    proxy: {
      '/gh': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gh/, ''),
        headers: {
          'User-Agent': 'github-globe',
          Accept: 'application/vnd.github+json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      }
    }
  }
})
