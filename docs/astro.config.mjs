// @ts-check
import starlight from "@astrojs/starlight";
import og from "astro-og";
import { defineConfig } from "astro/config";
import starlightDotMd from "starlight-dot-md";

export default defineConfig({
  site: "https://rune-cli.org",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Rune Docs",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon.ico",
            sizes: "32x32",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: "/apple-touch-icon.png",
          },
        },
      ],
      lastUpdated: true,
      defaultLocale: "root",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        ja: {
          label: "日本語",
        },
      },
      editLink: {
        baseUrl: "https://github.com/morinokami/rune/edit/main/docs/",
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/morinokami/rune" }],
      sidebar: [
        { slug: "index" },
        {
          label: "Getting Started",
          items: [
            { slug: "getting-started/installation" },
            { slug: "getting-started/project-structure" },
          ],
        },
        {
          label: "Guides",
          items: [
            { slug: "guides/routing" },
            { slug: "guides/commands" },
            { slug: "guides/testing" },
            { slug: "guides/json" },
            { slug: "guides/skills" },
            { slug: "guides/deployment" },
          ],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
      plugins: [starlightDotMd()],
    }),
    og(),
  ],
});
