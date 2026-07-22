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

/** Textarea helper: JSON round-trip for output. */
function jsonField(stage: StageLite, key: string) {
  return computed({
    get: () => JSON.stringify(stage[key] ?? {}, null, 1),
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
const outputField = computed(() => (selected.value ? jsonField(selected.value, "output") : null));

// Editor metadata: model list + sandbox tool catalog for the dropdowns.
const { data: meta } = await useFetch<{
  models: string[];
  tools: Array<{ name: string; classification: string; description: string }>;
}>("/api/meta", { lazy: true, server: false });
const modelItems = computed(() => ["(default)", ...(meta.value?.models ?? [])]);
const toolItems = computed(() =>
  (meta.value?.tools ?? []).map((t) => ({
    label: t.name,
    value: t.name,
    // Non-read-only custom tools need a classification object in the spec.
    classification: t.classification,
  })),
);

const modelField = computed({
  get: () => (selected.value?.model as string) || "(default)",
  set(v: string) {
    if (!selected.value) return;
    if (v === "(default)") delete selected.value.model;
    else selected.value.model = v;
  },
});

// Tools as a multi-select over the catalog: string entries stay strings;
// custom tools keep/gain their {name, classification} object form.
const BUILTINS = new Set(["read", "write", "edit", "bash", "grep", "find", "ls"]);
const toolsField = computed({
  get: () => (selected.value?.tools ?? []).map((t) => (typeof t === "string" ? t : (t as { name: string }).name)),
  set(names: string[]) {
    if (!selected.value) return;
    const catalog = new Map(toolItems.value.map((t) => [t.value, t.classification]));
    selected.value.tools = names.map((n) =>
      BUILTINS.has(n)
        ? n
        : { name: n, classification: catalog.get(n) ?? "read-only", optional: true },
    ) as never[];
  },
});

// from as a multi-select over the other stages.
const fromItems = computed(() => stages.value.filter((s) => s.id !== selectedId.value).map((s) => s.id));
const fromField = computed({
  get: () => {
    const f = selected.value?.from;
    return !f ? [] : Array.isArray(f) ? f : [f];
  },
  set(parts: string[]) {
    if (!selected.value) return;
    if (parts.length === 0) delete selected.value.from;
    else selected.value.from = parts.length === 1 ? parts[0] : parts;
  },
});

// writeAllow globs (comma-separated input).
const writeAllowField = computed({
  get: () => ((selected.value?.writeAllow as string[]) ?? []).join(", "),
  set(v: string) {
    if (!selected.value) return;
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) delete selected.value.writeAllow;
    else selected.value.writeAllow = parts;
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
          <ClientOnly>
            <WorkflowGraph :stages="stages" :selected="selectedId" @select="selectedId = $event" />
            <template #fallback>
              <div class="h-full flex items-center justify-center text-muted text-sm">loading canvas…</div>
            </template>
          </ClientOnly>
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
          <UFormField label="from (upstream stages)">
            <USelectMenu v-model="fromField" :items="fromItems" multiple size="sm" class="w-full" placeholder="(entry stage)" />
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
          <UFormField label="model">
            <!-- searchable menu — the model list is long -->
            <USelectMenu v-model="modelField" :items="modelItems" size="sm" class="w-full" />
          </UFormField>
          <UFormField label="tools (stage ceiling)">
            <USelectMenu
              v-model="toolsField"
              :items="toolItems.map((t) => t.value)"
              multiple
              size="sm"
              class="w-full"
              placeholder="(unrestricted)"
            />
          </UFormField>
          <UFormField label="write allow (globs, comma-separated)" hint="empty = unrestricted">
            <UInput v-model="writeAllowField" size="sm" class="w-full" placeholder="src/**, docs/**" />
          </UFormField>
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
