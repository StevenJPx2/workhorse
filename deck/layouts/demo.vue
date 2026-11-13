<!--
  A recording beside the story it tells: the slide's words on the left, and
  under ::right:: the recording, with a caption.

  ---
  layout: demo
  ---

  # The agent hears about CI

  Words …

  ::right::

  ![CI fails; the agent fixes and pushes](./media/sourcefed/docs/media/ci-failure.gif)

  CI fails on GitHub; sourcefed tells the agent.
-->

<script setup lang="ts">
import { useIsSlideActive } from "@slidev/client"
import { ref } from "vue"

const isActive = useIsSlideActive()
const dialog = ref<HTMLDialogElement | null>(null)
</script>

<template>
  <div class="slidev-layout demo">
    <div class="story">
      <slot />
    </div>
    <div class="recording">
      <!-- Mount the GIF on entry so it starts with this part of the story. -->
      <slot v-if="isActive" name="right" />
      <button v-if="isActive" type="button" @click="dialog?.showModal()">
        Enlarge recording
      </button>
    </div>
    <dialog v-if="isActive" ref="dialog" aria-label="Demo recording, enlarged">
      <button type="button" @click="dialog?.close()">Close recording</button>
      <slot name="right" />
    </dialog>
  </div>
</template>

<style scoped>
.demo {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 2rem;
  align-items: center;
  height: 100%;
}

.story {
  font-size: 0.92em;
}

.story :deep(td),
.story :deep(th) {
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
}

.recording {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  min-height: 0;
  max-height: 100%;
}

.recording :deep(img) {
  max-height: 23rem;
  max-width: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
}

.recording :deep(p:not(:has(img))) {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.3;
  opacity: 0.7;
  text-align: center;
}

button {
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  padding: 0.3rem 0.65rem;
  font-size: 0.7rem;
}

button:focus-visible {
  outline: 2px solid #6b4fbd;
  outline-offset: 3px;
}

/* The enlarged recording fills the screen, scaling past its natural size. */
dialog[open] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  position: fixed;
  inset: 0;
  margin: auto;
  width: 96vw;
  height: 94vh;
  max-width: none;
  max-height: none;
  padding: 1rem;
  border: 0;
  border-radius: 12px;
  color: #171717;
  background: #fff;
  text-align: center;
}

dialog button {
  font-size: 0.95rem;
}

dialog::backdrop {
  background: rgb(0 0 0 / 0.8);
}

dialog :deep(p:has(img)) {
  flex: 1;
  min-height: 0;
  width: 100%;
  margin: 0;
}

dialog :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: contain;
}

dialog :deep(p:not(:has(img))) {
  margin: 0;
  font-size: 1rem;
}
</style>
