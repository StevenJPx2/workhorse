<script setup lang="ts">
import { Comark } from "@comark/vue";

const route = useRoute();
const id = route.params.id as string;

const { data, refresh } = await useFetch<{
  ticket: Record<string, string | undefined>;
  workflow: { status?: string } | null;
  live: {
    phase?: string;
    runId?: string;
    status?: string;
    note?: string;
    outcome?: string;
    at?: string;
    tasks?: Array<{ id: string; status: string }>;
  } | null;
}>(`/api/tickets/${id}`);

const { data: diffData } = await useFetch<{ diff: string }>(`/api/tickets/${id}/diff`, {
  lazy: true,
  server: false,
});

interface ActivityEvent {
  type?: string;
  event?: string;
  ts?: string;
  timestamp?: string;
  tool?: string;
  name?: string;
  message?: string;
  raw?: string;
  [k: string]: unknown;
}
interface ActivityTask {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  events: ActivityEvent[];
  prompt?: string;
  analysis?: string;
  output?: string;
}
const { data: activity, refresh: refreshActivity } = await useFetch<{
  runId?: string;
  status?: string;
  tasks?: ActivityTask[];
  note?: string;
  usage?: { totalTokens?: number };
}>(`/api/tickets/${id}/activity`, { lazy: true, server: false });

// Durable trace archive: every run ever executed for this ticket.
interface TraceIndexEntry {
  runId: string;
  kind: string;
  archivedAt: string;
}
const { data: traces } = await useFetch<TraceIndexEntry[]>(`/api/tickets/${id}/traces`, {
  lazy: true,
  server: false,
});
const selectedTrace = ref<string>();
const { data: traceDetail } = await useFetch<{
  kind: string;
  archivedAt: string;
  activity: { usage?: { totalTokens?: number }; tasks?: ActivityTask[] };
}>(() => `/api/tickets/${id}/traces/${selectedTrace.value}`, {
  lazy: true,
  server: false,
  immediate: false,
  watch: [selectedTrace],
});

/** Verifier verdict pulled out of an activity task list, if present. */
function verifierVerdict(tasks?: ActivityTask[]): { verdict: string; detail: string } | null {
  const v = tasks?.find((t) => t.id.startsWith("verify"));
  if (!v?.analysis) return null;
  const fail = /verdict[\"'\s:=]+fail/i.test(v.analysis) || /\"verdict\":\s*\"fail\"/.test(v.analysis);
  return { verdict: fail ? "fail" : "pass", detail: v.analysis.slice(0, 400) };
}
const verdict = computed(() => verifierVerdict(activity.value?.tasks));

function eventLabel(e: ActivityEvent): string {
  const kind = e.type ?? e.event ?? "event";
  const detail =
    e.tool ?? e.name ?? e.message ?? (e.raw ? e.raw.slice(0, 120) : "");
  return detail ? `${kind} · ${String(detail).slice(0, 160)}` : String(kind);
}
function eventTime(e: ActivityEvent): string {
  const t = e.ts ?? e.timestamp;
  return t ? new Date(String(t)).toLocaleTimeString() : "";
}

let timer: ReturnType<typeof setInterval>;
onMounted(() => (timer = setInterval(() => {
  refresh();
  if (running.value) refreshActivity();
}, 10000)));
onUnmounted(() => clearInterval(timer));

const toast = useToast();
const stopping = ref(false);
async function stop() {
  stopping.value = true;
  try {
    await $fetch(`/api/tickets/${id}/stop`, { method: "POST" });
    toast.add({ title: "Stop signal sent", color: "warning" });
    refresh();
  } catch (e: unknown) {
    toast.add({ title: "Stop failed", description: String(e), color: "error" });
  } finally {
    stopping.value = false;
  }
}

const running = computed(() =>
  ["queued", "planning", "implementing", "ready-for-review"].includes(
    data.value?.ticket?.status ?? "",
  ),
);
const stoppable = computed(
  () => running.value || data.value?.ticket?.status === "in-review",
);
function taskDot(status: string): string {
  if (status === "completed") return "bg-success";
  if (status === "failed" || status === "interrupted") return "bg-error";
  if (status === "running") return "bg-primary animate-pulse";
  return "bg-muted";
}
</script>

<template>
  <div v-if="data" class="space-y-4">
    <div class="flex items-center gap-3">
      <UButton to="/" variant="ghost" icon="i-lucide-arrow-left" size="xs" />
      <h1 class="text-xl font-bold">{{ data.ticket.title }}</h1>
      <UBadge
        variant="subtle"
        :color="data.ticket.status === 'ready-for-review' ? 'warning' : data.ticket.status === 'done' ? 'success' : undefined"
      >
        {{ data.ticket.status === 'ready-for-review' ? 'verifying' : data.ticket.status }}
      </UBadge>
      <UBadge v-if="verdict" :color="verdict.verdict === 'pass' ? 'success' : 'error'" variant="soft">
        verifier: {{ verdict.verdict }}
      </UBadge>
      <div class="ml-auto flex gap-2">
        <UButton v-if="stoppable" color="warning" variant="soft" icon="i-lucide-octagon-x" :loading="stopping" @click="stop">
          Stop
        </UButton>
        <UButton v-if="data.ticket.prUrl" :to="data.ticket.prUrl" target="_blank" icon="i-lucide-git-pull-request">
          Open PR
        </UButton>
      </div>
    </div>

    <UCard>
      <div class="text-sm space-y-1">
        <div><span class="text-muted">repo:</span> {{ data.ticket.repo }}</div>
        <div><span class="text-muted">workflow:</span> {{ data.workflow?.status ?? "n/a" }}</div>
        <div v-if="data.ticket.branch"><span class="text-muted">branch:</span> {{ data.ticket.branch }}</div>
        <div v-if="data.ticket.error" class="text-error">{{ data.ticket.error }}</div>
      </div>
    </UCard>

    <UCard v-if="data.live">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-semibold">Live pipeline</div>
          <span class="text-muted text-xs">
            {{ data.live.phase }}{{ data.live.at ? ` · ${new Date(data.live.at).toLocaleTimeString()}` : "" }}
          </span>
        </div>
      </template>
      <div v-if="data.live.tasks?.length" class="flex flex-wrap items-center gap-3">
        <div v-for="task in data.live.tasks" :key="task.id" class="flex items-center gap-1.5 text-sm">
          <span class="size-2 rounded-full" :class="taskDot(task.status)" />
          <span>{{ task.id }}</span>
          <span class="text-muted text-xs">{{ task.status }}</span>
        </div>
      </div>
      <div v-else class="text-muted text-sm">{{ data.live.note ?? data.live.outcome ?? "…" }}</div>
    </UCard>

    <UCard>
      <template #header><div class="font-semibold">Task</div></template>
      <p class="text-sm whitespace-pre-wrap">{{ data.ticket.prompt }}</p>
    </UCard>

    <UCard v-if="data.ticket.result">
      <template #header><div class="font-semibold">Result</div></template>
      <div class="prose prose-sm dark:prose-invert max-w-none">
        <Comark>{{ data.ticket.result }}</Comark>
      </div>
    </UCard>

    <UCard v-if="diffData?.diff">
      <template #header><div class="font-semibold">Diff</div></template>
      <pre class="text-xs overflow-x-auto max-h-96">{{ diffData.diff }}</pre>
    </UCard>

    <UCard v-if="activity?.tasks?.length">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-semibold">Activity</div>
          <div class="flex items-center gap-2">
            <span class="text-muted text-xs">run {{ activity.runId }}</span>
            <UButton variant="ghost" size="xs" icon="i-lucide-refresh-cw" @click="refreshActivity()" />
          </div>
        </div>
      </template>
      <div class="space-y-4">
        <div v-for="task in activity.tasks" :key="task.id">
          <div class="flex items-center gap-2 mb-1">
            <UBadge :color="task.status === 'completed' ? 'success' : task.status === 'failed' ? 'error' : 'primary'" variant="subtle" size="sm">
              {{ task.status }}
            </UBadge>
            <span class="font-medium text-sm">{{ task.id }}</span>
            <span v-if="task.completedAt" class="text-muted text-xs ml-auto">
              {{ new Date(task.completedAt).toLocaleTimeString() }}
            </span>
          </div>
          <ol v-if="task.events.length" class="border-l border-default ml-1 pl-3 space-y-1 max-h-64 overflow-y-auto">
            <li v-for="(e, i) in task.events" :key="i" class="text-xs flex gap-2">
              <span class="text-muted shrink-0 w-16">{{ eventTime(e) }}</span>
              <span class="truncate">{{ eventLabel(e) }}</span>
            </li>
          </ol>
          <div v-else class="text-muted text-xs ml-4">no recorded events</div>
          <UAccordion
            v-if="task.prompt || task.analysis || task.output"
            class="mt-2"
            :items="[
              ...(task.prompt ? [{ label: 'Task prompt', content: task.prompt, value: 'p' }] : []),
              ...(task.analysis ? [{ label: 'Analysis', content: task.analysis, value: 'a' }] : []),
              ...(task.output ? [{ label: 'Raw output', content: task.output, value: 'o' }] : []),
            ]"
          >
            <template #content="{ item }">
              <pre class="text-xs whitespace-pre-wrap max-h-64 overflow-y-auto p-2">{{ item.content }}</pre>
            </template>
          </UAccordion>
        </div>
      </div>
    </UCard>
    <UCard v-else-if="activity?.note">
      <template #header><div class="font-semibold">Activity</div></template>
      <div class="text-muted text-sm">{{ activity.note }}</div>
    </UCard>

    <UCard v-if="traces?.length">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-semibold">Run history</div>
          <span class="text-muted text-xs">{{ traces.length }} archived run{{ traces.length === 1 ? "" : "s" }}</span>
        </div>
      </template>
      <div class="space-y-2">
        <div
          v-for="tr in traces"
          :key="tr.runId"
          class="flex items-center gap-3 text-sm cursor-pointer hover:bg-elevated rounded px-2 py-1"
          @click="selectedTrace = selectedTrace === tr.runId ? undefined : tr.runId"
        >
          <UIcon :name="selectedTrace === tr.runId ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="text-muted" />
          <UBadge variant="subtle" size="sm">{{ tr.kind }}</UBadge>
          <span class="font-mono text-xs">{{ tr.runId }}</span>
          <span class="text-muted text-xs ml-auto">{{ new Date(tr.archivedAt).toLocaleString() }}</span>
        </div>
        <div v-if="traceDetail && selectedTrace" class="border-l border-default ml-2 pl-3 space-y-2">
          <div class="text-xs text-muted">
            tokens: {{ traceDetail.activity?.usage?.totalTokens ?? "n/a" }}
          </div>
          <div v-for="task in traceDetail.activity?.tasks ?? []" :key="task.id" class="text-sm">
            <div class="flex items-center gap-2">
              <span class="size-1.5 rounded-full" :class="taskDot(task.status)" />
              <span class="font-medium">{{ task.id }}</span>
              <span class="text-muted text-xs">{{ task.status }}</span>
            </div>
            <pre v-if="task.analysis" class="text-xs whitespace-pre-wrap max-h-40 overflow-y-auto text-muted mt-1">{{ task.analysis }}</pre>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
