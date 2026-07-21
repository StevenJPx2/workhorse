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

// Declared workflow inputs (workflow_dispatch pattern): fetch the selected
// workflow's spec and render its inputs as real controls.
interface WorkflowInput {
  name: string;
  type: "string" | "boolean" | "number" | "choice";
  description?: string;
  default?: string | number | boolean;
  required?: boolean;
  options?: string[];
}
const wfInputs = ref<WorkflowInput[]>([]);
const inputValues = reactive<Record<string, string | number | boolean>>({});

const filing = ref(false);
const form = reactive({ repo: "", prompt: "", title: "", workflow: "coding" });
const toast = useToast();

watch(
  () => form.workflow,
  async (wf) => {
    wfInputs.value = [];
    if (!wf) return;
    try {
      const r = await $fetch<{ workflow: { spec: { inputs?: WorkflowInput[] } } }>(`/api/workflows/${wf}`);
      wfInputs.value = r.workflow.spec.inputs ?? [];
      for (const k of Object.keys(inputValues)) delete inputValues[k];
      for (const i of wfInputs.value) {
        if (i.default !== undefined) inputValues[i.name] = i.default;
      }
    } catch {
      /* workflow without registry entry */
    }
  },
  { immediate: true },
);
const inputsValid = computed(() =>
  wfInputs.value.every((i) => !i.required || (inputValues[i.name] !== undefined && inputValues[i.name] !== "")),
);

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
        inputs: wfInputs.value.length ? { ...inputValues } : undefined,
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
        <div v-if="wfInputs.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-default rounded-lg p-3">
          <UFormField
            v-for="i in wfInputs"
            :key="i.name"
            :label="i.name + (i.required ? ' *' : '')"
            :description="i.description"
          >
            <USelect v-if="i.type === 'choice'" v-model="inputValues[i.name] as string" :items="i.options ?? []" size="sm" class="w-full" />
            <UCheckbox v-else-if="i.type === 'boolean'" v-model="inputValues[i.name] as boolean" />
            <UInput v-else v-model="inputValues[i.name] as string" :type="i.type === 'number' ? 'number' : 'text'" size="sm" class="w-full" />
          </UFormField>
        </div>
        <div class="flex gap-3">
          <UInput v-model="form.title" placeholder="Title (optional)" class="flex-1" />
          <USelect v-model="form.workflow" :items="workflowItems" placeholder="workflow" class="w-44" />
          <UButton :loading="filing" :disabled="!form.repo || !form.prompt || !inputsValid" @click="fileTicket">
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
