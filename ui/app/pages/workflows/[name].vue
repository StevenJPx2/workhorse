<script setup lang="ts">
import type { StageLite } from "~/components/WorkflowGraph.vue";

interface WorkflowEntry {
  name: string;
  spec: {
    schemaVersion: number;
    name: string;
    description?: string;
    defaults?: Record<string, unknown>;
    artifactGraph: { stages: StageLite[] };
    [k: string]: unknown;
  };
  agents?: Record<string, string>;
  schemas?: Record<string, string>;
  source: "seed" | "user";
  updatedAt: string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const name = computed(() => String(route.params.name));

const { data, refresh } = await useFetch<{ workflow: WorkflowEntry }>(
  () => `/api/workflows/${name.value}`,
);

// Local editable copy of the spec (deep clone on load/refresh).
const spec = ref<WorkflowEntry["spec"] | null>(null);
watch(
  () => data.value?.workflow?.spec,
  (s) => {
    spec.value = s ? JSON.parse(JSON.stringify(s)) : null;
  },
  { immediate: true },
);

const stages = computed<StageLite[]>(() => spec.value?.artifactGraph?.stages ?? []);
const selectedId = ref<string | null>(null);
const selected = computed(() =>
  stages.value.find((s) => s.id === selectedId.value) ?? null,
);
const isSeed = computed(() => data.value?.workflow?.source === "seed");
const dirty = ref(false);
watch(spec, () => (dirty.value = true), { deep: true });

// --- stage editing -----------------------------------------------------

function addStage() {
  if (!spec.value) return;
  const last = stages.value[stages.value.length - 1];
  let id = "stage";
  for (let i = 1; stages.value.some((s) => s.id === id); i++) id = `stage-${i}`;
  spec.value.artifactGraph.stages.push({
    id,
    type: "single",
    ...(last ? { from: last.id } : {}),
    output: { analysis: { required: true } },
    prompt: "Describe what this stage should do.",
  });
  selectedId.value = id;
}

function removeStage(id: string) {
  if (!spec.value) return;
  const st = spec.value.artifactGraph.stages;
  spec.value.artifactGraph.stages = st.filter((s) => s.id !== id);
  // Detach dangling froms.
  for (const s of spec.value.artifactGraph.stages) {
    const f = s.from;
    if (f === id) delete s.from;
    else if (Array.isArray(f)) s.from = f.filter((x) => x !== id);
  }
  if (selectedId.value === id) selectedId.value = null;
}

/** Textarea helpers: JSON round-trip for tools / output / from. */
function jsonField(stage: StageLite, key: string) {
  return computed({
    get: () => JSON.stringify(stage[key] ?? (key === "tools" ? [] : {}), null, 1),
    set(v: string) {
      try {
        stage[key] = JSON.parse(v);
        jsonErrors.value[key] = "";
      } catch (e) {
        jsonErrors.value[key] = String(e);
      }
    },
  });
}
const jsonErrors = ref<Record<string, string>>({});
const toolsField = computed(() => (selected.value ? jsonField(selected.value, "tools") : null));
const outputField = computed(() => (selected.value ? jsonField(selected.value, "output") : null));

const fromField = computed({
  get: () => {
    const f = selected.value?.from;
    return !f ? "" : Array.isArray(f) ? f.join(", ") : f;
  },
  set(v: string) {
    if (!selected.value) return;
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) delete selected.value.from;
    else selected.value.from = parts.length === 1 ? parts[0] : parts;
  },
});

// --- save / save-as / delete -------------------------------------------

const saving = ref(false);
const saveAsName = ref("");
const validationError = ref("");

async function save(asName?: string) {
  if (!spec.value) return;
  const target = asName?.trim() || name.value;
  saving.value = true;
  validationError.value = "";
  try {
    const body = {
      spec: { ...spec.value, name: target },
      agents: data.value?.workflow?.agents,
      schemas: data.value?.workflow?.schemas,
    };
    await $fetch(`/api/workflows/${target}`, { method: "PUT", body });
    toast.add({ title: `Workflow "${target}" saved`, color: "success" });
    dirty.value = false;
    if (target !== name.value) await router.push(`/workflows/${target}`);
    else await refresh();
  } catch (e: unknown) {
    // 422 carries pi-workflow's parser message — surface it verbatim.
    const msg = (e as { statusMessage?: string })?.statusMessage ?? String(e);
    validationError.value = msg;
    toast.add({ title: "Validation failed", description: msg.slice(0, 200), color: "error" });
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirm(`Delete workflow "${name.value}"?`)) return;
  await $fetch(`/api/workflows/${name.value}`, { method: "delete" });
  await router.push("/workflows");
}

// Raw JSON drawer for full control.
const showRaw = ref(false);
const rawField = computed({
  get: () => JSON.stringify(spec.value, null, 2),
  set(v: string) {
    try {
      spec.value = JSON.parse(v);
      jsonErrors.value.raw = "";
    } catch (e) {
      jsonErrors.value.raw = String(e);
    }
  },
});
</script>

<template>
  <div v-if="data?.workflow" class="space-y-4">
    <div class="flex items-center gap-3 flex-wrap">
      <h1 class="text-xl font-bold">{{ name }}</h1>
      <UBadge :color="isSeed ? 'neutral' : 'primary'" variant="subtle">
        {{ data.workflow.source }}
      </UBadge>
      <span class="text-muted text-sm truncate">{{ spec?.description }}</span>
      <div class="ml-auto flex items-center gap-2">
        <UButton size="xs" variant="ghost" icon="i-lucide-code" @click="showRaw = !showRaw">
          {{ showRaw ? "Canvas" : "JSON" }}
        </UButton>
        <UButton v-if="!isSeed" size="xs" variant="soft" color="error" icon="i-lucide-trash-2" @click="remove" />
        <template v-if="isSeed">
          <UInput v-model="saveAsName" placeholder="copy-name" size="xs" class="w-36" />
          <UButton size="xs" :loading="saving" :disabled="!saveAsName.trim()" @click="save(saveAsName)">
            Save as
          </UButton>
        </template>
        <UButton v-else size="xs" :loading="saving" :disabled="!dirty" @click="save()">
          Save
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="validationError"
      color="error"
      variant="subtle"
      title="pi-workflow rejected the spec"
      :description="validationError.slice(0, 500)"
      class="text-xs"
    />
    <UAlert
      v-if="isSeed"
      color="info"
      variant="subtle"
      icon="i-lucide-lock"
      description="Seed workflows are read-only templates — edit freely, then Save-as under a new name."
    />

    <div v-if="showRaw">
      <UTextarea v-model="rawField" :rows="30" class="w-full font-mono text-xs" />
      <p v-if="jsonErrors.raw" class="text-error text-xs mt-1">{{ jsonErrors.raw }}</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- canvas -->
      <UCard class="lg:col-span-2" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="h-[420px]">
          <WorkflowGraph :stages="stages" :selected="selectedId" @select="selectedId = $event" />
        </div>
        <template #footer>
          <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="addStage">Add stage</UButton>
        </template>
      </UCard>

      <!-- side panel -->
      <UCard>
        <template #header>
          <div class="font-semibold text-sm">
            {{ selected ? `Stage: ${selected.id}` : "Select a stage" }}
          </div>
        </template>
        <div v-if="selected" class="space-y-3 text-sm">
          <UFormField label="id">
            <UInput v-model="selected.id" size="sm" class="w-full" />
          </UFormField>
          <UFormField label="from (comma-separated upstream stages)">
            <UInput v-model="fromField" size="sm" class="w-full" placeholder="(entry stage)" />
          </UFormField>
          <div class="grid grid-cols-2 gap-2">
            <UFormField label="agent">
              <UInput :model-value="selected.agent as string" size="sm" placeholder="default" @update:model-value="selected.agent = $event || undefined" />
            </UFormField>
            <UFormField label="thinking">
              <USelect
                :model-value="(selected.thinking as string) ?? 'low'"
                :items="['minimal', 'low', 'medium', 'high']"
                size="sm"
                @update:model-value="selected.thinking = $event"
              />
            </UFormField>
          </div>
          <div class="flex items-center gap-4">
            <UCheckbox
              :model-value="!!selected.readOnly"
              label="read-only"
              @update:model-value="selected.readOnly = $event === true ? true : undefined"
            />
            <UBadge v-if="selected.mode === 'loop'" color="warning" variant="subtle">loop stage</UBadge>
          </div>
          <UFormField label="prompt">
            <UTextarea
              :model-value="selected.prompt as string"
              :rows="6"
              size="sm"
              class="w-full font-mono text-xs"
              @update:model-value="selected.prompt = $event"
            />
          </UFormField>
          <UFormField v-if="toolsField" label="tools (JSON)" :error="jsonErrors.tools || undefined">
            <UTextarea v-model="toolsField.value" :rows="5" size="sm" class="w-full font-mono text-xs" />
          </UFormField>
          <UFormField v-if="outputField" label="output (JSON)" :error="jsonErrors.output || undefined">
            <UTextarea v-model="outputField.value" :rows="4" size="sm" class="w-full font-mono text-xs" />
          </UFormField>
          <UButton size="xs" color="error" variant="soft" icon="i-lucide-trash-2" @click="removeStage(selected.id)">
            Remove stage
          </UButton>
        </div>
        <div v-else class="text-muted text-sm">
          Click a node to edit its agent, tools, prompt, and wiring. Connections come from each
          stage's <code>from</code> field.
        </div>
      </UCard>
    </div>
  </div>
</template>
