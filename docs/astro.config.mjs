import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Rune",
      lastUpdated: true,
      editLink: {
        baseUrl: "https://github.com/morinokami/rune/edit/main/docs/",
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/morinokami/rune" }],
      sidebar: [
        {
          label: "Getting Started",
          items: [{ label: "Introduction", slug: "getting-started/introduction" }],
        },
        {
          label: "Guides",
          items: [{ label: "Example Guide", slug: "guides/example" }],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});
