<script setup lang="ts">
// Workflows are hard-coded, eval-tested defs (code, not user data) — this
// page is a READ-ONLY catalog + graph view. No create/upload/edit.
interface WorkflowMeta {
  name: string;
  description?: string;
  stageCount?: number;
}

const { data, refresh } = await useFetch<{ workflows: WorkflowMeta[] }>("/api/workflows");
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">Workflows</h1>
      <UButton variant="ghost" size="xs" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
    </div>

    <UAlert
      color="neutral"
      variant="soft"
      icon="i-lucide-code"
      title="Workflows are code"
      description="Each workflow is a hard-coded, eval-tested definition that ships with the app. This catalog is read-only; add or change a workflow by editing packages/workflow and adding an eval case."
      :ui="{ description: 'text-xs' }"
    />

    <UCard>
      <div v-if="!data?.workflows?.length" class="text-muted text-sm">No workflows available.</div>
      <ul v-else class="divide-y divide-default">
        <li v-for="w in data.workflows" :key="w.name" class="py-3 flex items-center gap-3">
          <NuxtLink :to="`/workflows/${w.name}`" class="font-medium hover:underline">
            {{ w.name }}
          </NuxtLink>
          <span class="text-muted text-sm truncate hidden sm:inline">{{ w.description }}</span>
          <UBadge v-if="w.stageCount" color="neutral" variant="subtle" class="ml-auto shrink-0">
            {{ w.stageCount }} {{ w.stageCount === 1 ? "stage" : "stages" }}
          </UBadge>
        </li>
      </ul>
    </UCard>
  </div>
</template>
