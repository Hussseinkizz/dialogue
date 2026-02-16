import { join } from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginLlms } from "@rspress/plugin-llms";

export default defineConfig({
  root: join(__dirname, "docs"),
  base: "/dialogue/",
  title: "Dialogue",
  description:
    "Event-based realtime communication library built on Socket.IO, Hono, and Bun",
  icon: "/rspress-icon.png",
  logoText: "🟢 Dialogue",
  plugins: [
    pluginLlms({
      exclude: ({ page }) => {
        // Exclude roadmap page from llms.txt generation
        return page.routePath === "/guide/others/roadmap";
      },
    }),
  ],
  themeConfig: {
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/Hussseinkizz/dialogue",
      },
    ],
    // Built-in search is enabled by default
    search: true,
    llmsUI: true,
  },
  markdown: {
    showLineNumbers: true,
    shiki: {
      theme: "vitesse-dark",
    },
    link: {
      checkDeadLinks: {
        excludes: ["/llms.txt", "/llms-full.txt"],
      },
    },
  },
});
