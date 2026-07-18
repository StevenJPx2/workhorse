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
  usage?: { totalTokens?: number; costUsd?: number };
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
interface TraceDetail {
  kind: string;
  archivedAt: string;
  activity: { usage?: { totalTokens?: number; costUsd?: number }; tasks?: ActivityTask[] };
}
const selectedTrace = ref<string>();
const traceDetail = ref<TraceDetail | null>(null);
const traceLoading = ref(false);
const traceCache = new Map<string, TraceDetail>();
async function toggleTrace(runId: string) {
  if (selectedTrace.value === runId) {
    selectedTrace.value = undefined;
    traceDetail.value = null;
    return;
  }
  selectedTrace.value = runId;
  const cached = traceCache.get(runId);
  if (cached) {
    traceDetail.value = cached;
    return;
  }
  traceDetail.value = null;
  traceLoading.value = true;
  try {
    const d = await $fetch<TraceDetail>(`/api/tickets/${id}/traces/${runId}`);
    traceCache.set(runId, d);
    // Only apply if the user hasn't clicked away meanwhile
    if (selectedTrace.value === runId) traceDetail.value = d;
  } finally {
    traceLoading.value = false;
  }
}

/** Verifier verdict pulled out of an activity task list, if present. */
function verifierVerdict(tasks?: ActivityTask[]): { verdict: string; detail: string } | null {
  const v = tasks?.find((t) => t.id.startsWith("verify"));
  if (!v?.analysis) return null;
  const fail = /verdict[\"'\s:=]+fail/i.test(v.analysis) || /\"verdict\":\s*\"fail\"/.test(v.analysis);
  return { verdict: fail ? "fail" : "pass", detail: v.analysis.slice(0, 400) };
}
const verdict = computed(() => verifierVerdict(activity.value?.tasks));

/** Human names for pipeline stages. */
const STAGE_META: Record<string, { label: string; icon: string; blurb: string }> = {
  plan: { label: "Plan", icon: "i-lucide-map", blurb: "read-only — studies the repo, decides what to change" },
  implement: { label: "Implement", icon: "i-lucide-hammer", blurb: "makes the changes" },
  verify: { label: "Verify", icon: "i-lucide-shield-alert", blurb: "adversarial review by a separate agent" },
  fix: { label: "Fix", icon: "i-lucide-wrench", blurb: "addresses verifier findings" },
};
function stageMeta(taskId: string) {
  const key = taskId.split(".")[0] ?? taskId;
  return STAGE_META[key] ?? { label: taskId, icon: "i-lucide-circle", blurb: "" };
}
/** Wall-clock duration of a task from its event timestamps. */
function taskDuration(t: ActivityTask): string {
  const ts = t.events
    .map((e) => e.timestamp ?? e.ts)
    .filter(Boolean)
    .map((x) => new Date(String(x)).getTime());
  if (ts.length < 2) return "";
  const secs = Math.round((Math.max(...ts) - Math.min(...ts)) / 1000);
  return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
}
/** Retry count — the only genuinely interesting fact in the engine events. */
function taskAttempts(t: ActivityTask): number {
  return t.events.filter((e) => (e.type ?? "") === "attempt.started").length;
}
/** Human explanation for WHY a stage failed, mined from engine events. */
const FAILURE_EXPLANATIONS: Record<string, string> = {
  model:
    "the model call failed — this is almost always an expired or invalid OAuth token (the agent process exits cleanly with no output)",
  spawn: "the agent process could not be started inside the sandbox",
  timeout: "the stage hit its runtime limit",
  output: "the agent finished but did not produce the required structured output",
};
function taskFailure(t: ActivityTask): string | null {
  if (t.status !== "failed") return null;
  const fails = t.events.filter((e) => (e.type ?? "") === "attempt.failed");
  if (!fails.length) return "no failure detail was recorded";
  const last = fails[fails.length - 1] as { data?: { failureKind?: string; exitCode?: number; signal?: string | null } };
  const kind = last?.data?.failureKind ?? "unknown";
  const why = FAILURE_EXPLANATIONS[kind] ?? `failure kind: ${kind}`;
  const attempts = fails.length;
  const extra: string[] = [];
  if (last?.data?.exitCode !== undefined && last.data.exitCode !== 0) extra.push(`exit code ${last.data.exitCode}`);
  if (last?.data?.signal) extra.push(`signal ${last.data.signal}`);
  return `Failed after ${attempts} attempt${attempts > 1 ? "s" : ""}: ${why}${extra.length ? ` (${extra.join(", ")})` : ""}.`;
}
/** "initial" / "revision-2" / "rev1-failed" → human labels. */
function traceKindLabel(kind: string): string {
  if (kind === "initial") return "First run";
  const rev = kind.match(/^revision-(\d+)$/);
  if (rev) return `Revision ${rev[1]}`;
  const failed = kind.match(/^rev(\d+)-failed$/);
  if (failed) return `Revision ${failed[1]} — failed`;
  if (kind === "run-failed") return "Run — failed";
  return kind;
}
function fmtCost(u?: { totalTokens?: number; costUsd?: number }): string {
  if (!u) return "";
  const parts: string[] = [];
  if (u.totalTokens) parts.push(`${(u.totalTokens / 1000).toFixed(1)}k tokens`);
  if (u.costUsd) parts.push(`$${u.costUsd.toFixed(3)}`);
  return parts.join(" · ");
}

let timer: ReturnType<typeof setInterval>;
onMounted(() => (timer = setInterval(() => {
  refresh();
  if (running.value) refreshActivity();
}, 10000)));
onUnmounted(() => clearInterval(timer));

const toast = useToast();
const healing = ref(false);
async function heal() {
  healing.value = true;
  try {
    const r = await $fetch<{ ok: boolean; reason?: string; instance?: string }>(
      `/api/tickets/${id}/heal`,
      { method: "POST" },
    );
    toast.add(
      r.ok
        ? { title: "Healing", description: `Re-dispatched as ${r.instance}`, color: "success" }
        : { title: "Cannot heal", description: r.reason, color: "warning" },
    );
    refresh();
  } catch (e: unknown) {
    toast.add({ title: "Heal failed", description: String(e), color: "error" });
  } finally {
    healing.value = false;
  }
}
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
const parked = computed(() => data.value?.ticket?.status === "in-review");
const stoppable = computed(() => running.value || parked.value);
/** What compute is actually happening right now — the honest line. */
const computeState = computed(() => {
  const wf = data.value?.workflow?.status ?? "";
  if (running.value) return { label: "sandbox active — agent running", color: "text-primary" };
  if (parked.value)
    return {
      label: "parked — zero compute; sandbox asleep, waiting for PR feedback (webhook wakes it)",
      color: "text-muted",
    };
  if (wf === "errored" || data.value?.ticket?.status === "errored")
    return { label: "workflow dead — nothing running", color: "text-error" };
  return { label: "nothing running", color: "text-muted" };
});
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
        <UButton v-if="data.ticket.status === 'errored'" color="success" variant="soft" icon="i-lucide-heart-pulse" :loading="healing" @click="heal">
          Heal
        </UButton>
        <UButton v-if="stoppable" color="warning" variant="soft" :icon="parked ? 'i-lucide-x' : 'i-lucide-octagon-x'" :loading="stopping" @click="stop">
          {{ parked ? "Cancel ticket" : "Stop" }}
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
        <div :class="computeState.color">{{ computeState.label }}</div>
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
          <span>{{ stageMeta(task.id).label }}</span>
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
          <div class="font-semibold">Pipeline</div>
          <div class="flex items-center gap-2">
            <span v-if="fmtCost(activity.usage)" class="text-muted text-xs">{{ fmtCost(activity.usage) }}</span>
            <UButton variant="ghost" size="xs" icon="i-lucide-refresh-cw" @click="refreshActivity()" />
          </div>
        </div>
      </template>
      <div class="space-y-1">
        <div v-for="(task, ti) in activity.tasks" :key="task.id" class="relative">
          <!-- connector line -->
          <div v-if="ti < activity.tasks!.length - 1" class="absolute left-[15px] top-8 bottom-0 w-px bg-(--ui-border)" />
          <div class="flex items-start gap-3 py-2">
            <div
              class="size-8 rounded-full flex items-center justify-center shrink-0 ring-1"
              :class="task.status === 'completed' ? 'bg-success/10 ring-success/30 text-success'
                : task.status === 'failed' ? 'bg-error/10 ring-error/30 text-error'
                : task.status === 'running' ? 'bg-primary/10 ring-primary/30 text-primary'
                : 'bg-muted ring-(--ui-border) text-muted'"
            >
              <UIcon :name="task.status === 'running' ? 'i-lucide-loader-circle' : stageMeta(task.id).icon" :class="task.status === 'running' && 'animate-spin'" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="font-medium text-sm">{{ stageMeta(task.id).label }}</span>
                <span class="text-muted text-xs">{{ stageMeta(task.id).blurb }}</span>
                <span class="ml-auto text-xs text-muted shrink-0">
                  {{ taskDuration(task) }}<template v-if="taskAttempts(task) > 1"> · {{ taskAttempts(task) }} attempts</template>
                </span>
              </div>
              <!-- What the stage concluded, rendered as prose — the actually useful part -->
              <div v-if="task.analysis" class="prose prose-sm dark:prose-invert max-w-none mt-1 text-sm">
                <Comark>{{ task.analysis }}</Comark>
              </div>
              <div v-else-if="task.status === 'running'" class="text-muted text-sm mt-1 italic">working…</div>
              <div v-if="taskFailure(task)" class="mt-1 text-sm text-error flex items-start gap-1.5">
                <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0 mt-0.5" />
                <span>{{ taskFailure(task) }}</span>
              </div>
              <UCollapsible v-if="task.prompt || task.output" class="mt-1">
                <UButton variant="link" color="neutral" size="xs" icon="i-lucide-chevron-right" class="px-0">
                  details
                </UButton>
                <template #content>
                  <div class="space-y-2 mt-1">
                    <div v-if="task.prompt">
                      <div class="text-xs font-medium text-muted mb-0.5">Instructions given to this stage</div>
                      <pre class="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto p-2 bg-elevated rounded">{{ task.prompt }}</pre>
                    </div>
                    <div v-if="task.output">
                      <div class="text-xs font-medium text-muted mb-0.5">Raw agent output</div>
                      <pre class="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto p-2 bg-elevated rounded">{{ task.output }}</pre>
                    </div>
                  </div>
                </template>
              </UCollapsible>
            </div>
          </div>
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
        <template v-for="tr in traces" :key="tr.runId">
          <div
            class="flex items-center gap-3 text-sm cursor-pointer hover:bg-elevated rounded px-2 py-1"
            @click="toggleTrace(tr.runId)"
          >
            <UIcon :name="selectedTrace === tr.runId ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="text-muted" />
            <UBadge :color="tr.kind.includes('failed') ? 'error' : 'neutral'" variant="subtle" size="sm">{{ traceKindLabel(tr.kind) }}</UBadge>
            <span class="text-muted text-xs ml-auto">{{ new Date(tr.archivedAt).toLocaleString() }}</span>
          </div>
          <div v-if="selectedTrace === tr.runId" class="border-l-2 border-primary/30 ml-2.5 pl-4 py-1 space-y-3">
            <div v-if="traceLoading" class="text-muted text-sm flex items-center gap-2">
              <UIcon name="i-lucide-loader-circle" class="animate-spin size-3.5" /> loading run…
            </div>
            <template v-else-if="traceDetail">
              <div v-if="fmtCost(traceDetail.activity?.usage)" class="text-xs text-muted">
                {{ fmtCost(traceDetail.activity.usage) }}
              </div>
              <div v-for="task in traceDetail.activity?.tasks ?? []" :key="task.id">
                <div class="flex items-center gap-2 text-sm">
                  <span class="size-1.5 rounded-full shrink-0" :class="taskDot(task.status)" />
                  <span class="font-medium">{{ stageMeta(task.id).label }}</span>
                  <span class="text-muted text-xs">{{ task.status }}</span>
                  <span class="text-muted text-xs ml-auto">{{ taskDuration(task) }}</span>
                </div>
                <div v-if="task.analysis" class="prose prose-sm dark:prose-invert max-w-none mt-0.5 ml-3.5 text-sm opacity-90">
                  <Comark>{{ task.analysis }}</Comark>
                </div>
                <div v-if="taskFailure(task)" class="mt-0.5 ml-3.5 text-sm text-error flex items-start gap-1.5">
                  <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0 mt-0.5" />
                  <span>{{ taskFailure(task) }}</span>
                </div>
              </div>
              <div v-if="!traceDetail.activity?.tasks?.length" class="text-muted text-sm">
                no stage data was captured for this run
              </div>
            </template>
          </div>
        </template>
      </div>
    </UCard>
  </div>
</template>
