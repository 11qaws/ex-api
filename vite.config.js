import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/ex-api/",
  build: {
    rollupOptions: {
      input: {
        editor: `${projectRoot}editor/index.html`,
        widget: `${projectRoot}index.html`,
      },
    },
    target: "chrome103",
  },
});
