import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
  // GitHub Pages のリポジトリパス配下で配信する
  base: "/chan-models/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // manifold-3d は wasm を import.meta.url 相対で読むため、esbuild の
  // プリバンドルから除外しないと dev サーバーで解決に失敗する(公式README)
  optimizeDeps: {
    exclude: ["manifold-3d"],
  },
  build: {
    target: "es2022",
  },
});
