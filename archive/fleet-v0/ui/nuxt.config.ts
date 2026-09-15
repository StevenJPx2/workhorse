export default defineNuxtConfig({
  modules: ["@nuxt/ui"],
  devtools: { enabled: false },
  css: ["~/assets/css/main.css"],
  nitro: {
    preset: "cloudflare_module",
    experimental: {
      asyncContext: true,
    },
    cloudflare: {
      deployConfig: false,
      nodeCompat: true,
    },
  },
  runtimeConfig: {
    // Server-side only — the bearer token never reaches the browser.
    workhorseUrl: "https://workhorse-sandbox.stevenjpx2.workers.dev",
    workhorseToken: "", // NUXT_WORKHORSE_TOKEN (Worker secret)
  },
  app: {
    head: {
      title: "Workhorse Fleet",
    },
  },
});
