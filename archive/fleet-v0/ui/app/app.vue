<script setup lang="ts">
const links = [
  { label: "Home", to: "/", icon: "i-lucide-message-square" },
  { label: "Fleet", to: "/tickets", icon: "i-lucide-list-todo" },
  { label: "Workflows", to: "/workflows", icon: "i-lucide-workflow" },
  { label: "Agents", to: "/agents", icon: "i-lucide-bot" },
];
</script>

<template>
  <UApp>
    <div class="min-h-screen">
      <header class="border-b border-default px-4 py-3 flex items-center gap-3 sm:gap-6">
        <NuxtLink to="/" class="font-bold text-lg flex items-center gap-2 shrink-0">
          <UIcon name="i-lucide-tractor" class="size-5" />
          <span class="hidden sm:inline">Workhorse</span>
        </NuxtLink>
        <!-- Mobile: icon-only nav that fits; desktop: full labels. -->
        <UNavigationMenu :items="links" class="hidden sm:flex" />
        <UNavigationMenu
          :items="links.map((l) => ({ ...l, label: undefined }))"
          class="flex sm:hidden"
        />
      </header>
      <main class="p-3 sm:p-4 max-w-5xl mx-auto">
        <NuxtPage />
      </main>
    </div>
  </UApp>
</template>
