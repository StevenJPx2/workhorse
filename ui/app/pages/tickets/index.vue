<script setup lang="ts">
interface Ticket {
  id: string;
  title: string;
  status: string;
  repo: string;
  prUrl?: string;
  createdAt: string;
  updatedAt: string;
}

const { data, refresh } = await useFetch<{ tickets: Ticket[] }>("/api/tickets");
useIntervalFn(() => refresh(), 15000);

// ?active=1 → only running statuses (the home page's "View running" link).
const route = useRoute();
const ACTIVE = ["queued", "planning", "implementing", "ready-for-review", "in-review"];
const shown = computed(() => {
  const all = data.value?.tickets ?? [];
  return route.query.active ? all.filter((t) => ACTIVE.includes(t.status)) : all;
});

const { data: wfData } = await useFetch<{ workflows: Array<{ name: string }> }>("/api/workflows");
const workflowItems = computed(() => (wfData.value?.workflows ?? []).map((w) => w.name));

const filing = ref(false);
const form = reactive({ repo: "", prompt: "", title: "", workflow: "coding" });
const toast = useToast();

async function fileTicket() {
  filing.value = true;
  try {
    const r = await $fetch<{ ticket: Ticket }>("/api/tickets", {
      method: "POST",
      body: {
        repo: form.repo,
        prompt: form.prompt,
        title: form.title || undefined,
        workflow: form.workflow || undefined,
      },
    });
    toast.add({ title: `Ticket ${r.ticket.id} filed`, color: "success" });
    form.prompt = "";
    form.title = "";
    refresh();
  } catch (e: unknown) {
    toast.add({ title: "Failed to file ticket", description: String(e), color: "error" });
  } finally {
    filing.value = false;
  }
}

const statusColor: Record<string, string> = {
  done: "success",
  errored: "error",
  terminated: "neutral",
  queued: "neutral",
  "ready-for-review": "warning",
};

function useIntervalFn(fn: () => void, ms: number) {
  let t: ReturnType<typeof setInterval>;
  onMounted(() => (t = setInterval(fn, ms)));
  onUnmounted(() => clearInterval(t));
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="font-semibold">File a ticket</div>
      </template>
      <div class="space-y-3">
        <UInput v-model="form.repo" placeholder="https://github.com/user/repo" icon="i-lucide-github" class="w-full" />
        <UTextarea v-model="form.prompt" placeholder="What should the agent do? Scope, constraints, acceptance criteria…" :rows="3" class="w-full" />
        <div class="flex gap-3">
          <UInput v-model="form.title" placeholder="Title (optional)" class="flex-1" />
          <USelect v-model="form.workflow" :items="workflowItems" placeholder="workflow" class="w-44" />
          <UButton :loading="filing" :disabled="!form.repo || !form.prompt" @click="fileTicket">
            Dispatch
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-semibold">Fleet</div>
          <UButton variant="ghost" icon="i-lucide-refresh-cw" size="xs" @click="refresh()" />
        </div>
      </template>
      <div v-if="!shown.length" class="text-muted text-sm">No tickets{{ route.query.active ? " running" : " yet" }}.</div>
      <ul v-else class="divide-y divide-default">
        <li v-for="t in shown" :key="t.id" class="py-3 flex items-center gap-3">
          <UBadge :color="statusColor[t.status] ?? 'primary'" variant="subtle">{{ t.status }}</UBadge>
          <NuxtLink :to="`/tickets/${t.id}`" class="font-medium hover:underline truncate">
            {{ t.title }}
          </NuxtLink>
          <span class="text-muted text-xs truncate hidden sm:inline">{{ t.repo.replace("https://github.com/", "") }}</span>
          <div class="ml-auto flex items-center gap-2 shrink-0">
            <UButton v-if="t.prUrl" :to="t.prUrl" target="_blank" size="xs" variant="soft" icon="i-lucide-git-pull-request">
              PR
            </UButton>
            <span class="text-muted text-xs">{{ new Date(t.updatedAt).toLocaleTimeString() }}</span>
          </div>
        </li>
      </ul>
    </UCard>
  </div>
</template>
