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

const filing = ref(false);
const form = reactive({ repo: "", prompt: "", title: "" });
const toast = useToast();

async function fileTicket() {
  filing.value = true;
  try {
    const r = await $fetch<{ ticket: Ticket }>("/api/tickets", {
      method: "POST",
      body: { repo: form.repo, prompt: form.prompt, title: form.title || undefined },
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
      <div v-if="!data?.tickets?.length" class="text-muted text-sm">No tickets yet.</div>
      <ul v-else class="divide-y divide-default">
        <li v-for="t in data.tickets" :key="t.id" class="py-3 flex items-center gap-3">
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
