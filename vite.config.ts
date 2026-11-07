import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { localMt32Plugin } from './extractor/local_mt32';

export default defineConfig({
  base: "/kyraweb/",
  plugins: [vue(), localMt32Plugin()],
  server: { port: 5173, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] } }
});
