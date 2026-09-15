<script setup lang="ts">
// Agent blocks: reusable agent definitions (persona + tool ceiling)
// referenced from workflow stages by name.
interface AgentBlock {
  name: string;
  description: string;
  tools: string[];
  persona: string;
  source: "seed" | "user";
  updatedAt: string;
}

const { data, refresh } = await useFetch<{ agents: AgentBlock[] }>("/api/agents");
const toast = useToast();

const selected = ref<AgentBlock | null>(null);
const editName = ref("");
const editDescription = ref("");
const editTools = ref("");
const editPersona = ref("");
const saving = ref(false);

function select(a: AgentBlock | null) {
  selected.value = a;
  editName.value = a?.name ?? "";
  editDescription.value = a?.description ?? "";
  editTools.value = a?.tools.join(", ") ?? "";
  editPersona.value = a?.persona ?? "";
}

async function save() {
  const name = editName.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  if (!name || !editPersona.value.trim()) return;
  saving.value = true;
  try {
    await $fetch(`/api/agents/${name}`, {
      method: "PUT",
      body: {
        description: editDescription.value,
        tools: editTools.value.split(",").map((t) => t.trim()).filter(Boolean),
        persona: editPersona.value,
      },
    });
    toast.add({ title: `Agent block "${name}" saved`, color: "success" });
    await refresh();
    select(data.value?.agents.find((a) => a.name === name) ?? null);
  } catch (e) {
    toast.add({ title: "Save failed", description: String(e), color: "error" });
  } finally {
    saving.value = false;
  }
}

async function remove(name: string) {
  if (!confirm(`Delete agent block "${name}"?`)) return;
  await $fetch(`/api/agents/${name}`, { method: "delete" });
  select(null);
  refresh();
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold">Agent blocks</h1>
        <p class="text-muted text-sm">
          Reusable agent definitions — persona + tool ceiling. Reference one from any workflow
          stage via its <code>agent</code> field.
        </p>
      </div>
      <UButton size="sm" icon="i-lucide-plus" variant="soft" @click="select({ name: '', description: '', tools: [], persona: '', source: 'user', updatedAt: '' })">
        New block
      </UButton>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <UCard>
        <div v-if="!data?.agents?.length" class="text-muted text-sm">
          No agent blocks. Seed from the baked defaults via <code>POST /agents/seed</code>.
        </div>
        <ul v-else class="divide-y divide-default">
          <li
            v-for="a in data.agents"
            :key="a.name"
            class="py-2.5 flex items-center gap-2 cursor-pointer hover:bg-elevated rounded px-2"
            :class="selected?.name === a.name ? 'bg-elevated' : ''"
            @click="select(a)"
          >
            <UBadge :color="a.source === 'seed' ? 'neutral' : 'primary'" variant="subtle" size="sm">
              {{ a.source }}
            </UBadge>
            <span class="font-medium text-sm">{{ a.name }}</span>
            <span class="text-muted text-xs truncate">{{ a.description }}</span>
          </li>
        </ul>
      </UCard>

      <UCard class="lg:col-span-2">
        <div v-if="!selected" class="text-muted text-sm">Select a block to edit, or create a new one.</div>
        <div v-else class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="name">
              <UInput v-model="editName" size="sm" class="w-full" placeholder="verifier" />
            </UFormField>
            <UFormField label="description">
              <UInput v-model="editDescription" size="sm" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="tool ceiling (comma-separated; empty = open)" description="Stages using this block inherit these tools unless they declare their own.">
            <UInput v-model="editTools" size="sm" class="w-full" placeholder="read, grep, find, aft_search" />
          </UFormField>
          <UFormField label="persona (system prompt)">
            <UTextarea v-model="editPersona" :rows="12" size="sm" class="w-full font-mono text-xs" />
          </UFormField>
          <div class="flex gap-2">
            <UButton size="sm" :loading="saving" :disabled="!editName.trim() || !editPersona.trim()" @click="save">
              Save
            </UButton>
            <UButton v-if="selected.name" size="sm" color="error" variant="soft" icon="i-lucide-trash-2" @click="remove(selected.name)" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
