// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cspHashes from "./src/integrations/csp-hashes.mjs";

export default defineConfig({
  site: "https://everythingstar-foss.happypaul55.com",
  build: {
    format: "file",
    // External CSS so the CSP can forbid inline styles.
    inlineStylesheets: "never",
  },
  trailingSlash: "never",
  // `csp-hashes` keeps the strict `_headers` policy honest after a build: it
  // rewrites any inline `style` attribute (there are none today) and hashes any
  // inline script or `<style>` Astro emits, so `'unsafe-inline'` is never needed.
  integrations: [sitemap(), cspHashes()],
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
