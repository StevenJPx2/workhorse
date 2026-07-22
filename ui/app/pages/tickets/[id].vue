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
    awaitingInput?: { stageId: string; request: { title?: string; schema: Record<string, unknown> } };
  } | null;
}>(`/api/tickets/${id}`);

const { data: diffData } = await useFetch<{ diff: string }>(`/api/tickets/${id}/diff`, {
  lazy: true,
  server: false,
});

// Live streaming output: the running stage's session log tail, polled
// while the ticket is active.
const { data: liveOut, refresh: refreshOutput } = await useFetch<{
  stage?: string;
  status?: string;
  output?: string | null;
  note?: string;
}>(`/api/tickets/${id}/output`, { lazy: true, server: false });
const outputBox = ref<HTMLElement>();
watch(
  () => liveOut.value?.output,
  () => nextTick(() => outputBox.value?.scrollTo({ top: outputBox.value.scrollHeight })),
);

// Workflow graph (run visualization): the ticket's workflow spec rendered
// as the artifact graph, with live per-stage status overlaid.
const wfName = computed(() => data.value?.ticket?.workflow ?? "coding");
const { data: wfEntry } = await useFetch<{ workflow: { spec: { artifactGraph: { stages: Array<Record<string, unknown>> } } } }>(
  () => `/api/workflows/${wfName.value}`,
  { lazy: true, server: false },
);
const graphStages = computed(() => (wfEntry.value?.workflow?.spec?.artifactGraph?.stages ?? []) as never[]);
const liveStageStatus = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {};
  for (const t of data.value?.live?.tasks ?? []) {
    // pi-workflow task ids look like "<stage>" or "<stage>:<round>".
    out[t.id.split(":")[0]!] = t.status;
  }
  return out;
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
  if (running.value) {
    refreshActivity();
    refreshOutput();
  }
}, 8000)));
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

const steerText = ref("");
const steering = ref(false);
async function steer() {
  const message = steerText.value.trim();
  if (!message) return;
  steering.value = true;
  try {
    await $fetch(`/api/tickets/${id}/steer`, { method: "POST", body: { message } });
    steerText.value = "";
    toast.add({
      title: "Steer queued",
      description: "The current stage restarts with your instructions within ~1 min.",
      color: "success",
    });
  } catch (e: unknown) {
    toast.add({ title: "Steer failed", description: String(e), color: "error" });
  } finally {
    steering.value = false;
  }
}

// Operator input (awaiting-input park).
const sendingInput = ref(false);
async function sendInput(answers: Record<string, unknown>) {
  sendingInput.value = true;
  try {
    await $fetch(`/api/tickets/${id}/input`, { method: "POST", body: { answers } });
    toast.add({ title: "Answers sent — the stage resumes", color: "success" });
    refresh();
  } catch (e: unknown) {
    toast.add({ title: "Input failed", description: String(e), color: "error" });
  } finally {
    sendingInput.value = false;
  }
}

// Attach context to a live ticket (plugin-recognized refs).
const attachInput = ref("");
const attaching = ref(false);
async function attachContext() {
  const input = attachInput.value.trim();
  if (!input) return;
  attaching.value = true;
  try {
    const { match } = await $fetch<{ match: { kind: string; ref: string } | null }>(
      "/api/attachments/match",
      { method: "POST", body: { input } },
    );
    if (!match) {
      toast.add({ title: "Not a recognized reference", color: "warning" });
      return;
    }
    const r = await $fetch<{ delivered: string }>(`/api/tickets/${id}/attach`, {
      method: "POST",
      body: match,
    });
    attachInput.value = "";
    toast.add({ title: `Context attached (${r.delivered})`, color: "success" });
  } catch (e: unknown) {
    toast.add({ title: "Attach failed", description: String(e), color: "error" });
  } finally {
    attaching.value = false;
  }
}

// Acceptance verdicts (report/artifact outcomes).
const accepting = ref(false);
async function accept() {
  accepting.value = true;
  try {
    await $fetch(`/api/tickets/${id}/accept`, { method: "POST" });
    toast.add({ title: "Accepted — ticket completes", color: "success" });
    refresh();
  } catch (e: unknown) {
    toast.add({ title: "Accept failed", description: String(e), color: "error" });
  } finally {
    accepting.value = false;
  }
}
const changeComment = ref("");
const requestingChanges = ref(false);
async function requestChanges() {
  const comment = changeComment.value.trim();
  if (!comment) return;
  requestingChanges.value = true;
  try {
    await $fetch(`/api/tickets/${id}/request-changes`, { method: "POST", body: { comment } });
    changeComment.value = "";
    toast.add({ title: "Changes requested — the agent revises", color: "success" });
    refresh();
  } catch (e: unknown) {
    toast.add({ title: "Request failed", description: String(e), color: "error" });
  } finally {
    requestingChanges.value = false;
  }
}

const tabItems = [
  { label: "Result", slot: "result", icon: "i-lucide-file-check" },
  { label: "Task", slot: "task", icon: "i-lucide-clipboard-list" },
  { label: "Pipeline", slot: "pipeline", icon: "i-lucide-list-tree" },
  { label: "History", slot: "history", icon: "i-lucide-history" },
];

const running = computed(() =>
  ["queued", "planning", "implementing", "ready-for-review"].includes(
    data.value?.ticket?.status ?? "",
  ),
);
const parked = computed(() =>
  ["in-review", "awaiting-input", "awaiting-acceptance"].includes(data.value?.ticket?.status ?? ""),
);
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
        <template v-if="data.ticket.status === 'awaiting-acceptance'">
          <UButton color="success" icon="i-lucide-check" :loading="accepting" @click="accept">
            Accept result
          </UButton>
        </template>
      </div>
    </div>

    <!-- awaiting operator input: render the requested form -->
    <UCard v-if="data.ticket.status === 'awaiting-input' && data.live?.awaitingInput">
      <template #header>
        <div class="font-semibold">
          {{ data.live.awaitingInput.request.title ?? `Stage \"${data.live.awaitingInput.stageId}\" needs your input` }}
        </div>
      </template>
      <SchemaForm
        :schema="data.live.awaitingInput.request.schema"
        submit-label="Send answers"
        :busy="sendingInput"
        @submit="sendInput"
      />
    </UCard>

    <!-- awaiting acceptance: request-changes affordance -->
    <UCard v-if="data.ticket.status === 'awaiting-acceptance'">
      <template #header>
        <div class="font-semibold">Request changes</div>
      </template>
      <div class="flex gap-2">
        <UInput v-model="changeComment" class="flex-1" size="sm" placeholder="What should the agent revise?" @keydown.enter="requestChanges" />
        <UButton size="sm" color="warning" variant="soft" :loading="requestingChanges" :disabled="!changeComment.trim()" @click="requestChanges">
          Send
        </UButton>
      </div>
    </UCard>

    <!-- meta line: repo · branch · compute state — one row, not a card -->
    <div class="flex items-center gap-3 text-xs text-muted flex-wrap">
      <span class="flex items-center gap-1"><UIcon name="i-lucide-github" class="size-3.5" />{{ data.ticket.repo.replace("https://github.com/", "").replace(/\.git$/, "") }}</span>
      <span v-if="data.ticket.branch" class="flex items-center gap-1"><UIcon name="i-lucide-git-branch" class="size-3.5" />{{ data.ticket.branch }}</span>
      <span :class="computeState.color">{{ computeState.label }}</span>
      <span v-if="data.ticket.error" class="text-error">{{ data.ticket.error }}</span>
    </div>

    <!-- THE RUN: graph + live output, the page's centerpiece while active -->
    <UCard v-if="data.live && data.ticket.status !== 'done'" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-semibold">Run</div>
          <span class="text-muted text-xs">
            {{ data.live.phase }}{{ data.live.at ? ` · ${new Date(data.live.at).toLocaleTimeString()}` : "" }}
          </span>
        </div>
      </template>
      <div class="grid grid-cols-1 lg:grid-cols-2">
        <div v-if="graphStages.length && data.live.tasks?.length" class="h-56 border-b lg:border-b-0 lg:border-r border-default">
          <ClientOnly>
            <WorkflowGraph :stages="graphStages" :live-status="liveStageStatus" />
          </ClientOnly>
        </div>
        <div v-else class="p-3 text-muted text-sm">{{ data.live.note ?? data.live.outcome ?? "…" }}</div>
        <!-- live agent output -->
        <div class="h-56 flex flex-col">
          <div class="px-3 py-1.5 text-xs text-muted border-b border-default flex items-center gap-2">
            <span class="relative flex size-1.5">
              <span v-if="running" class="animate-ping absolute inline-flex size-full rounded-full bg-primary opacity-75" />
              <span class="relative inline-flex rounded-full size-1.5" :class="running ? 'bg-primary' : 'bg-neutral'" />
            </span>
            {{ liveOut?.stage ? `agent output — ${liveOut.stage}` : "agent output" }}
          </div>
          <div ref="outputBox" class="flex-1 overflow-y-auto px-3 py-2 bg-elevated/50">
            <pre v-if="liveOut?.output" class="text-[11px] leading-relaxed whitespace-pre-wrap font-mono">{{ liveOut.output }}</pre>
            <div v-else class="text-muted text-xs italic">{{ liveOut?.note ?? "waiting for output…" }}</div>
          </div>
        </div>
      </div>
      <div v-if="running" class="p-3 border-t border-default space-y-2">
        <div class="flex gap-2">
          <UInput
            v-model="steerText"
            class="flex-1"
            size="sm"
            placeholder="Steer the agent — delivered into the live session at the next turn…"
            icon="i-lucide-navigation"
            @keydown.enter="steer"
          />
          <UButton size="sm" variant="soft" :loading="steering" :disabled="!steerText.trim()" @click="steer">
            Steer
          </UButton>
        </div>
        <div class="flex gap-2">
          <UInput
            v-model="attachInput"
            class="flex-1"
            size="sm"
            placeholder="Attach context — PROJ-123, Slack link, owner/repo…"
            icon="i-lucide-paperclip"
            @keydown.enter="attachContext"
          />
          <UButton size="sm" variant="ghost" :loading="attaching" :disabled="!attachInput.trim()" @click="attachContext">
            Attach
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- result + everything else, tabbed instead of stacked -->
    <UTabs :items="tabItems" variant="link" :ui="{ trigger: 'grow' }" class="w-full">
      <template #result>
        <div class="space-y-4 pt-2">
          <UCard v-if="data.ticket.result">
            <div class="prose prose-sm dark:prose-invert max-w-none">
              <Comark>{{ data.ticket.result }}</Comark>
            </div>
          </UCard>
          <div v-else class="text-muted text-sm pt-4 text-center">No result yet.</div>
          <UCard v-if="diffData?.diff">
            <template #header><div class="font-semibold text-sm">Diff</div></template>
            <pre class="text-xs overflow-x-auto max-h-96">{{ diffData.diff }}</pre>
          </UCard>
        </div>
      </template>
      <template #task>
        <UCard class="mt-2">
          <p class="text-sm whitespace-pre-wrap">{{ data.ticket.prompt }}</p>
        </UCard>
      </template>
      <template #pipeline>
        <div class="pt-2">
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
        </div>
      </template>
      <template #history>
        <div class="pt-2">
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
    <div v-else class="text-muted text-sm pt-4 text-center">No archived runs yet.</div>
        </div>
      </template>
    </UTabs>
  </div>
</template>
