<script setup lang="ts">
interface WorkflowMeta {
  name: string;
  description?: string;
  source: "seed" | "user";
  updatedAt: string;
  stages?: number;
}

const { data, refresh } = await useFetch<{ workflows: WorkflowMeta[] }>("/api/workflows");
const toast = useToast();

const creating = ref(false);
const newName = ref("");
const router = useRouter();

async function createBlank() {
  const name = newName.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!name) return;
  creating.value = true;
  try {
    // Minimal valid single-stage spec as the canvas starting point.
    await $fetch(`/api/workflows/${name}`, {
      method: "PUT",
      body: {
        spec: {
          schemaVersion: 1,
          name,
          description: "New workflow",
          defaults: { agent: "coder", readOnly: false, thinking: "low" },
          artifactGraph: {
            stages: [
              {
                id: "plan",
                type: "single",
                readOnly: true,
                output: { analysis: { required: true } },
                prompt: "Describe what this stage should do.",
              },
            ],
          },
        },
      },
    });
    await router.push(`/workflows/${name}`);
  } catch (e) {
    toast.add({ title: "Create failed", description: String(e), color: "error" });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">Workflows</h1>
      <div class="flex gap-2">
        <UInput v-model="newName" placeholder="new-workflow-name" size="sm" @keydown.enter="createBlank" />
        <UButton :loading="creating" :disabled="!newName.trim()" size="sm" icon="i-lucide-plus" @click="createBlank">
          Create
        </UButton>
      </div>
    </div>

    <UCard>
      <div v-if="!data?.workflows?.length" class="text-muted text-sm">
        No workflows registered. Seeds appear after <code>POST /workflows/seed</code>.
      </div>
      <ul v-else class="divide-y divide-default">
        <li v-for="w in data.workflows" :key="w.name" class="py-3 flex items-center gap-3">
          <UBadge :color="w.source === 'seed' ? 'neutral' : 'primary'" variant="subtle">
            {{ w.source }}
          </UBadge>
          <NuxtLink :to="`/workflows/${w.name}`" class="font-medium hover:underline">
            {{ w.name }}
          </NuxtLink>
          <span class="text-muted text-sm truncate hidden sm:inline">{{ w.description }}</span>
          <span class="ml-auto text-muted text-xs shrink-0">
            {{ new Date(w.updatedAt).toLocaleDateString() }}
          </span>
        </li>
      </ul>
      <template #footer>
        <UButton variant="ghost" size="xs" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
      </template>
    </UCard>
  </div>
</template>
