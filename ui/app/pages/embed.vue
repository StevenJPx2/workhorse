<script setup lang="ts">
// Compact fleet view purpose-built for dashboard iframes (Glance tiles):
// header-less, dense, dark-aware, deep links open the full UI.
definePageMeta({ layout: false });

interface Ticket {
  id: string;
  title: string;
  status: string;
  repo: string;
  prUrl?: string;
  updatedAt: string;
}

const { data, refresh } = await useFetch<{ tickets: Ticket[] }>("/api/tickets");
let timer: ReturnType<typeof setInterval>;
onMounted(() => (timer = setInterval(() => refresh(), 30000)));
onUnmounted(() => clearInterval(timer));

const RUNNING = ["queued", "planning", "implementing", "ready-for-review"];
const PARKED = ["in-review", "awaiting-input", "awaiting-acceptance"];
const shown = computed(() => {
  const all = data.value?.tickets ?? [];
  const score = (t: Ticket) =>
    RUNNING.includes(t.status) ? 0 : t.status === "errored" ? 1 : PARKED.includes(t.status) ? 2 : 3;
  return [...all].sort((a, b) => score(a) - score(b) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
});

const dot = (s: string) =>
  RUNNING.includes(s) ? "bg-blue-500 animate-pulse" : s === "errored" ? "bg-red-500" : s === "done" ? "bg-green-500" : PARKED.includes(s) ? "bg-amber-500" : "bg-gray-500";
</script>

<template>
  <div class="min-h-screen bg-transparent p-2 text-sm">
    <ul class="space-y-1.5">
      <li v-for="t in shown" :key="t.id" class="flex items-center gap-2">
        <span class="size-2 rounded-full shrink-0" :class="dot(t.status)" />
        <a :href="`/tickets/${t.id}`" target="_blank" class="truncate hover:underline">{{ t.title }}</a>
        <a v-if="t.prUrl" :href="t.prUrl" target="_blank" class="text-xs opacity-60 hover:opacity-100 shrink-0">PR</a>
        <span class="ml-auto text-xs opacity-50 shrink-0">{{ t.status }}</span>
      </li>
      <li v-if="!shown.length" class="opacity-50 text-xs">fleet idle</li>
    </ul>
  </div>
</template>
