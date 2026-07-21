<script setup lang="ts">
// Chat-first home: ONE chat box as the front door. Attach a repo (+ workflow)
// → the message files a ticket; no repo attached → plain fleet-agent chat.
import { Comark } from "@comark/vue";

interface Msg {
  role: "user" | "assistant";
  content: string;
}
interface Ticket {
  id: string;
  title: string;
  status: string;
  repo: string;
  prUrl?: string;
  updatedAt: string;
}

const toast = useToast();

// --- repo attachments ----------------------------------------------------
const { data: repoData } = await useFetch<{ repos: string[] }>("/api/repos");
const { data: wfData } = await useFetch<{ workflows: Array<{ name: string }> }>("/api/workflows");

const knownRepos = computed(() => {
  // Dedupe by normalized slug (KV-era records may differ only in .git/URL form).
  const seen = new Map<string, { url: string; label: string }>();
  for (const r of repoData.value?.repos ?? []) {
    const label = r.replace("https://github.com/", "").replace(/\.git$/, "").toLowerCase();
    if (!seen.has(label)) seen.set(label, { url: r, label });
  }
  return [...seen.values()];
});
const attachedRepo = ref<string | null>(null);
const showAddRepo = ref(false);
const newRepo = ref("");
const workflow = ref<string>("coding");
const workflowItems = computed(() => [
  ...(wfData.value?.workflows ?? []).map((w) => w.name),
  { label: "+ create new workflow…", value: "__new__" },
]);
watch(workflow, (w) => {
  if (w === "__new__") {
    workflow.value = "coding";
    navigateTo("/workflows");
  }
});

function attach(url: string) {
  attachedRepo.value = attachedRepo.value === url ? null : url;
}
function addRepo() {
  const r = newRepo.value.trim();
  if (!r) return;
  attachedRepo.value = /^[\w.-]+\/[\w.-]+$/.test(r) ? `https://github.com/${r}.git` : r;
  showAddRepo.value = false;
  newRepo.value = "";
}

// --- chat / dispatch -------------------------------------------------------
const messages = ref<Msg[]>([]);
const input = ref("");
const busy = ref(false);
const box = ref<HTMLElement>();

async function send() {
  const content = input.value.trim();
  if (!content || busy.value) return;
  busy.value = true;
  input.value = "";

  if (attachedRepo.value) {
    // Repo attached → this message files a ticket.
    messages.value.push({ role: "user", content: `📌 ${attachedRepo.value.replace("https://github.com/", "").replace(/\.git$/, "")} · ${workflow.value}\n\n${content}` });
    try {
      const r = await $fetch<{ ticket: Ticket }>("/api/tickets", {
        method: "POST",
        body: { repo: attachedRepo.value, prompt: content, workflow: workflow.value },
      });
      messages.value.push({
        role: "assistant",
        content: `Filed **[${r.ticket.id}](/tickets/${r.ticket.id})** on \`${r.ticket.repo.replace("https://github.com/", "").replace(/\.git$/, "")}\` with the \`${workflow.value}\` workflow. Watch it on the [ticket page](/tickets/${r.ticket.id}).`,
      });
      refreshFleet();
    } catch (e) {
      messages.value.push({ role: "assistant", content: `⚠️ Filing failed: ${String(e)}` });
    }
  } else {
    // No repo → fleet-agent chat.
    messages.value.push({ role: "user", content });
    try {
      const r = await $fetch<{ reply: string }>("/api/chat", {
        method: "POST",
        body: { messages: messages.value.slice(-12).map((m) => ({ role: m.role, content: m.content })) },
      });
      messages.value.push({ role: "assistant", content: r.reply });
    } catch (e) {
      messages.value.push({ role: "assistant", content: `⚠️ ${String(e)}` });
    }
  }
  busy.value = false;
  await nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight, behavior: "smooth" }));
}

// --- running fleet strip ----------------------------------------------------
const { data: fleet, refresh: refreshFleet } = await useFetch<{ tickets: Ticket[] }>("/api/tickets");
// "Running" = compute actively burning — parked states (in-review,
// awaiting-*) are NOT running.
const RUNNING = ["queued", "planning", "implementing", "ready-for-review"];
const running = computed(() => (fleet.value?.tickets ?? []).filter((t) => RUNNING.includes(t.status)));

let timer: ReturnType<typeof setInterval>;
onMounted(() => (timer = setInterval(() => refreshFleet(), 15000)));
onUnmounted(() => clearInterval(timer));

const statusColor: Record<string, string> = {
  queued: "neutral",
  planning: "info",
  implementing: "primary",
  "ready-for-review": "warning",
  "in-review": "warning",
};
</script>

<template>
  <div class="max-w-3xl w-full mx-auto flex flex-col justify-center gap-4" style="min-height: calc(100vh - 8rem)">
    <!-- chat transcript -->
    <div ref="box" class="flex-1 overflow-y-auto space-y-3 pt-2">
      <div v-if="!messages.length" class="text-center pt-16 space-y-2">
        <UIcon name="i-lucide-tractor" class="size-10 text-muted" />
        <p class="text-lg font-medium">What should the fleet work on?</p>
        <p class="text-muted text-sm">
          Attach a repo to dispatch a ticket — or just ask about the fleet:
          <em>"what's running?"</em> · <em>"why did be45ecec fail?"</em>
        </p>
      </div>
      <div v-for="(m, i) in messages" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
        <div
          class="rounded-lg px-3 py-2 max-w-[85%] text-sm"
          :class="m.role === 'user' ? 'bg-primary/10 whitespace-pre-wrap' : 'bg-elevated prose prose-sm dark:prose-invert max-w-none'"
        >
          <Comark v-if="m.role === 'assistant'" :streaming="busy && i === messages.length - 1" caret>{{ m.content }}</Comark>
          <template v-else>{{ m.content }}</template>
        </div>
      </div>
      <div v-if="busy" class="text-muted text-sm animate-pulse">working…</div>
    </div>

    <!-- composer -->
    <div class="space-y-2">
      <div class="flex gap-2">
        <UInput
          v-model="input"
          class="flex-1"
          size="lg"
          :placeholder="attachedRepo ? `Describe the task for ${attachedRepo.replace('https://github.com/', '').replace(/\.git$/, '')}…` : 'Message the fleet, or attach a repo to dispatch work…'"
          :disabled="busy"
          @keydown.enter="send"
        />
        <UButton size="lg" :loading="busy" :disabled="!input.trim()" :icon="attachedRepo ? 'i-lucide-rocket' : 'i-lucide-send'" @click="send" />
      </div>

      <!-- repo chips + workflow select -->
      <div class="flex items-center gap-2 flex-wrap">
        <UButton
          v-for="r in knownRepos.slice(0, 6)"
          :key="r.url"
          size="xs"
          :variant="attachedRepo === r.url ? 'solid' : 'outline'"
          :color="attachedRepo === r.url ? 'primary' : 'neutral'"
          icon="i-lucide-github"
          @click="attach(r.url)"
        >
          {{ r.label }}
        </UButton>
        <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="showAddRepo = !showAddRepo">
          Add new
        </UButton>
        <template v-if="attachedRepo">
          <div class="ml-auto flex items-center gap-1.5">
            <span class="text-xs text-muted">workflow</span>
            <USelect v-model="workflow" :items="workflowItems" size="xs" class="w-40" />
          </div>
        </template>
      </div>
      <div v-if="showAddRepo" class="flex gap-2">
        <UInput
          v-model="newRepo"
          class="flex-1"
          size="sm"
          placeholder="owner/repo or full git URL"
          icon="i-lucide-github"
          @keydown.enter="addRepo"
        />
        <UButton size="sm" variant="soft" :disabled="!newRepo.trim()" @click="addRepo">Attach</UButton>
      </div>
    </div>

    <!-- running fleet strip -->
    <UCard :ui="{ body: 'py-3 sm:py-3' }">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold flex items-center gap-2">
          <span class="relative flex size-2">
            <span v-if="running.length" class="animate-ping absolute inline-flex size-full rounded-full bg-primary opacity-75" />
            <span class="relative inline-flex rounded-full size-2" :class="running.length ? 'bg-primary' : 'bg-neutral'" />
          </span>
          Running now ({{ running.length }})
        </div>
        <div class="flex gap-3 text-xs">
          <NuxtLink to="/tickets?active=1" class="text-primary hover:underline">View running agents</NuxtLink>
          <NuxtLink to="/tickets" class="text-muted hover:underline">View all agents</NuxtLink>
        </div>
      </div>
      <div v-if="!running.length" class="text-muted text-xs">Fleet is idle.</div>
      <ul v-else class="space-y-1.5">
        <li v-for="t in running.slice(0, 5)" :key="t.id" class="flex items-center gap-2 text-sm">
          <UBadge :color="statusColor[t.status] ?? 'primary'" variant="subtle" size="sm">{{ t.status }}</UBadge>
          <NuxtLink :to="`/tickets/${t.id}`" class="truncate hover:underline">{{ t.title }}</NuxtLink>
          <span class="ml-auto text-muted text-xs shrink-0 hidden sm:inline">
            {{ t.repo.replace("https://github.com/", "").replace(/\.git$/, "") }}
          </span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
