<script setup lang="ts">
interface Msg {
  role: "user" | "assistant";
  content: string;
}

const messages = ref<Msg[]>([]);
const input = ref("");
const busy = ref(false);
const box = ref<HTMLElement>();

async function send() {
  const content = input.value.trim();
  if (!content || busy.value) return;
  messages.value.push({ role: "user", content });
  input.value = "";
  busy.value = true;
  await nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight }));
  try {
    const r = await $fetch<{ reply: string }>("/api/chat", {
      method: "POST",
      body: { messages: messages.value.slice(-12) },
    });
    messages.value.push({ role: "assistant", content: r.reply });
  } catch (e: unknown) {
    messages.value.push({ role: "assistant", content: `⚠️ ${String(e)}` });
  } finally {
    busy.value = false;
    await nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight }));
  }
}
</script>

<template>
  <div class="flex flex-col" style="height: calc(100vh - 8rem)">
    <div ref="box" class="flex-1 overflow-y-auto space-y-3 pb-4">
      <div v-if="!messages.length" class="text-muted text-sm pt-8 text-center">
        Talk to the fleet agent — file tickets, check status, stop runs, steer work.<br />
        e.g. <em>"What's running right now?"</em> · <em>"Stop ticket 1dc5f927 and refile it with a stricter scope"</em>
      </div>
      <div v-for="(m, i) in messages" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
        <div
          class="rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap"
          :class="m.role === 'user' ? 'bg-primary/10' : 'bg-elevated'"
        >
          {{ m.content }}
        </div>
      </div>
      <div v-if="busy" class="text-muted text-sm animate-pulse">agent thinking…</div>
    </div>
    <div class="flex gap-2 pt-2 border-t border-default">
      <UInput
        v-model="input"
        class="flex-1"
        placeholder="Message the fleet agent…"
        :disabled="busy"
        @keydown.enter="send"
      />
      <UButton :loading="busy" :disabled="!input.trim()" icon="i-lucide-send" @click="send" />
    </div>
  </div>
</template>
