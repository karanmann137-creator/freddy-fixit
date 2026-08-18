import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the three big third-party libraries out of the app chunk.
        // Two reasons, and the second is the bigger one:
        //   1. The browser fetches them in parallel instead of as one blob.
        //   2. They change only when we upgrade a dependency, so a returning
        //      visitor after a normal deploy re-downloads the app code and
        //      keeps ~all of the vendor code from cache. Previously every
        //      one-line copy change invalidated the whole 500kB+ bundle.
        // Framer Motion is deliberately its own chunk: it is the largest of
        // the three and the one most likely to be dropped later.
        //
        // This MUST be the function form, not the object form. Vite 8 builds
        // with rolldown, and rolldown accepts only a function here: it wraps
        // whatever you pass into an advancedChunks group and then CALLS it
        // (rolldown-build.mjs: `return manualChunks(moduleId, {...})`), so an
        // object throws `TypeError: manualChunks is not a function` and the
        // build dies. The function form is valid Rollup API too, so this is
        // the portable spelling. It broke a deploy once — leave it as is.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|wouter)[\\/]/.test(id)) return "react";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("framer-motion")) return "motion";
        },
      },
    },
  },
});
