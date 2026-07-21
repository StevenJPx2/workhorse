<script setup lang="ts">
const links = [
  { label: "Home", to: "/", icon: "i-lucide-message-square" },
  { label: "Fleet", to: "/tickets", icon: "i-lucide-list-todo" },
  { label: "Workflows", to: "/workflows", icon: "i-lucide-workflow" },
];
</script>

<template>
  <UApp>
    <div class="min-h-screen">
      <header class="border-b border-default px-4 py-3 flex items-center gap-6">
        <NuxtLink to="/" class="font-bold text-lg flex items-center gap-2">
          <UIcon name="i-lucide-tractor" class="size-5" /> Workhorse
        </NuxtLink>
        <UNavigationMenu :items="links" />
      </header>
      <main class="p-4 max-w-5xl mx-auto">
        <NuxtPage />
      </main>
    </div>
  </UApp>
</template>
