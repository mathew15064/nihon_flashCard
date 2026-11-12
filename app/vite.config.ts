import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins:[react(),tailwindcss()],
  resolve:{alias:{"@":resolve(import.meta.dirname,"src")}},
  root:resolve(import.meta.dirname,"src/frontend"),
  publicDir:resolve(import.meta.dirname,"public"),
  build:{
    outDir:resolve(import.meta.dirname,"dist/client"),
    emptyOutDir:true,
    sourcemap:false,
  },
  server:{middlewareMode:true},
  appType:"spa",
});
