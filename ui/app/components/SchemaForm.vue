<script setup lang="ts">
// Schema-driven form: renders input controls from a JSON-schema object
// (the workflow-inputs / awaiting-input contract). Emits the answers.
interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number | boolean>;
  description?: string;
  default?: unknown;
}

const props = defineProps<{
  schema: JsonSchema;
  submitLabel?: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ submit: [answers: Record<string, unknown>] }>();

const fields = computed(() =>
  Object.entries(props.schema.properties ?? {}).map(([name, sub]) => ({
    name,
    schema: sub,
    required: props.schema.required?.includes(name) ?? false,
    kind: sub.enum ? "choice" : sub.type === "boolean" ? "boolean" : sub.type === "number" ? "number" : "text",
  })),
);

const values = reactive<Record<string, unknown>>({});
for (const f of fields.value) {
  values[f.name] = f.schema.default ?? (f.kind === "boolean" ? false : undefined);
}

const valid = computed(() =>
  fields.value.every((f) => !f.required || (values[f.name] !== undefined && values[f.name] !== "")),
);

function submit() {
  const answers: Record<string, unknown> = {};
  for (const f of fields.value) {
    let v = values[f.name];
    if (v === undefined || v === "") continue;
    if (f.kind === "number") v = Number(v);
    answers[f.name] = v;
  }
  emit("submit", answers);
}
</script>

<template>
  <div class="space-y-3">
    <UFormField
      v-for="f in fields"
      :key="f.name"
      :label="f.name + (f.required ? ' *' : '')"
      :description="f.schema.description"
    >
      <USelect
        v-if="f.kind === 'choice'"
        v-model="values[f.name] as string"
        :items="(f.schema.enum ?? []).map(String)"
        class="w-full"
        size="sm"
      />
      <UCheckbox v-else-if="f.kind === 'boolean'" v-model="values[f.name] as boolean" />
      <UInput
        v-else
        v-model="values[f.name] as string"
        :type="f.kind === 'number' ? 'number' : 'text'"
        class="w-full"
        size="sm"
      />
    </UFormField>
    <UButton :loading="busy" :disabled="!valid" size="sm" @click="submit">
      {{ submitLabel ?? "Submit" }}
    </UButton>
  </div>
</template>
