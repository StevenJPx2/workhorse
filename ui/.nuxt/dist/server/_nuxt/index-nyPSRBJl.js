import { u as useFetch, _ as _sfc_main$4 } from "./fetch-Zx8SmWud.js";
import { _ as _sfc_main$5 } from "./Input-BuhyYZlo.js";
import { useSlots, computed, useTemplateRef, watch, nextTick, unref, mergeProps, withCtx, createVNode, renderSlot, openBlock, createBlock, createCommentVNode, useSSRContext, defineComponent, withAsyncContext, ref, reactive, createTextVNode, toDisplayString, Fragment, renderList } from "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/vue/index.mjs";
import { ssrRenderComponent, ssrRenderAttrs, ssrInterpolate, ssrRenderSlot, ssrRenderClass, ssrRenderList } from "vue/server-renderer";
import { e as useComponentProps, f as useAppConfig, g as useFormField, h as useComponentIcons, t as tv, P as Primitive, i as _sfc_main$2, j as _sfc_main$3, l as looseToNumber, b as useToast, c as _sfc_main$6, d as _sfc_main$7, _ as __nuxt_component_0 } from "../server.mjs";
import { useVModel } from "@vueuse/core";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/@nuxt/nitro-server/dist/runtime/h3-compat.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/ohash/dist/index.mjs";
import "@vue/shared";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/ofetch/dist/node.mjs";
import "#internal/nuxt/paths";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/hookable/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/unctx/dist/index.mjs";
import "vue-router";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/defu/dist/defu.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/ufo/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/@unhead/vue/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/klona/dist/index.mjs";
import "@iconify/vue";
import "tailwindcss/colors";
import "@vueuse/shared";
import "tailwind-variants";
import "@iconify/utils/lib/css/icon";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/perfect-debounce/dist/index.mjs";
import "ohash/utils";
import "@floating-ui/vue";
import "aria-hidden";
const theme = {
  "slots": {
    "root": "relative inline-flex items-center",
    "base": [
      "w-full rounded-md border-0 appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75",
      "transition-colors"
    ],
    "leading": "absolute start-0 flex items-start",
    "leadingIcon": "shrink-0 text-dimmed",
    "leadingAvatar": "shrink-0",
    "leadingAvatarSize": "",
    "trailing": "absolute end-0 flex items-start",
    "trailingIcon": "shrink-0 text-dimmed"
  },
  "variants": {
    "fieldGroup": {
      "horizontal": {
        "root": "group has-focus-visible:z-[1]",
        "base": "group-not-only:group-first:rounded-e-none group-not-only:group-last:rounded-s-none group-not-last:group-not-first:rounded-none"
      },
      "vertical": {
        "root": "group has-focus-visible:z-[1]",
        "base": "group-not-only:group-first:rounded-b-none group-not-only:group-last:rounded-t-none group-not-last:group-not-first:rounded-none"
      }
    },
    "size": {
      "xs": {
        "base": "px-2 py-1 text-sm/4 gap-1",
        "leading": "ps-2 inset-y-1",
        "trailing": "pe-2 inset-y-1",
        "leadingIcon": "size-4",
        "leadingAvatarSize": "3xs",
        "trailingIcon": "size-4"
      },
      "sm": {
        "base": "px-2.5 py-1.5 text-sm/4 gap-1.5",
        "leading": "ps-2.5 inset-y-1.5",
        "trailing": "pe-2.5 inset-y-1.5",
        "leadingIcon": "size-4",
        "leadingAvatarSize": "3xs",
        "trailingIcon": "size-4"
      },
      "md": {
        "base": "px-2.5 py-1.5 text-base/5 gap-1.5",
        "leading": "ps-2.5 inset-y-1.5",
        "trailing": "pe-2.5 inset-y-1.5",
        "leadingIcon": "size-5",
        "leadingAvatarSize": "2xs",
        "trailingIcon": "size-5"
      },
      "lg": {
        "base": "px-3 py-2 text-base/5 gap-2",
        "leading": "ps-3 inset-y-2",
        "trailing": "pe-3 inset-y-2",
        "leadingIcon": "size-5",
        "leadingAvatarSize": "2xs",
        "trailingIcon": "size-5"
      },
      "xl": {
        "base": "px-3 py-2 text-base gap-2",
        "leading": "ps-3 inset-y-2",
        "trailing": "pe-3 inset-y-2",
        "leadingIcon": "size-6",
        "leadingAvatarSize": "xs",
        "trailingIcon": "size-6"
      }
    },
    "variant": {
      "outline": "text-highlighted bg-default ring ring-inset ring-accented",
      "soft": "text-highlighted bg-elevated/50 hover:bg-elevated focus:bg-elevated disabled:bg-elevated/50",
      "subtle": "text-highlighted bg-elevated ring ring-inset ring-accented",
      "ghost": "text-highlighted bg-transparent hover:bg-elevated focus:bg-elevated disabled:bg-transparent dark:disabled:bg-transparent",
      "none": "text-highlighted bg-transparent focus:outline-none"
    },
    "color": {
      "primary": "",
      "secondary": "",
      "success": "",
      "info": "",
      "warning": "",
      "error": "",
      "neutral": ""
    },
    "leading": {
      "true": ""
    },
    "trailing": {
      "true": ""
    },
    "loading": {
      "true": ""
    },
    "highlight": {
      "true": ""
    },
    "fixed": {
      "false": ""
    },
    "type": {
      "file": "file:me-1.5 file:font-medium file:text-muted file:outline-none"
    },
    "autoresize": {
      "true": {
        "base": "resize-none"
      }
    }
  },
  "compoundVariants": [
    {
      "color": "primary",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-primary/25 focus-visible:outline-3 focus-visible:ring-primary"
    },
    {
      "color": "secondary",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-secondary/25 focus-visible:outline-3 focus-visible:ring-secondary"
    },
    {
      "color": "success",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-success/25 focus-visible:outline-3 focus-visible:ring-success"
    },
    {
      "color": "info",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-info/25 focus-visible:outline-3 focus-visible:ring-info"
    },
    {
      "color": "warning",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-warning/25 focus-visible:outline-3 focus-visible:ring-warning"
    },
    {
      "color": "error",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-error/25 focus-visible:outline-3 focus-visible:ring-error"
    },
    {
      "color": "primary",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-primary/25 focus-visible:outline-3"
    },
    {
      "color": "secondary",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-secondary/25 focus-visible:outline-3"
    },
    {
      "color": "success",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-success/25 focus-visible:outline-3"
    },
    {
      "color": "info",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-info/25 focus-visible:outline-3"
    },
    {
      "color": "warning",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-warning/25 focus-visible:outline-3"
    },
    {
      "color": "error",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-error/25 focus-visible:outline-3"
    },
    {
      "color": "primary",
      "highlight": true,
      "class": "ring ring-inset ring-primary"
    },
    {
      "color": "secondary",
      "highlight": true,
      "class": "ring ring-inset ring-secondary"
    },
    {
      "color": "success",
      "highlight": true,
      "class": "ring ring-inset ring-success"
    },
    {
      "color": "info",
      "highlight": true,
      "class": "ring ring-inset ring-info"
    },
    {
      "color": "warning",
      "highlight": true,
      "class": "ring ring-inset ring-warning"
    },
    {
      "color": "error",
      "highlight": true,
      "class": "ring ring-inset ring-error"
    },
    {
      "color": "neutral",
      "variant": [
        "outline",
        "subtle"
      ],
      "class": "outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted"
    },
    {
      "color": "neutral",
      "variant": [
        "soft",
        "ghost"
      ],
      "class": "outline-inverted/25 focus-visible:outline-3"
    },
    {
      "color": "neutral",
      "highlight": true,
      "class": "ring ring-inset ring-inverted"
    },
    {
      "leading": true,
      "size": "xs",
      "class": "ps-7"
    },
    {
      "leading": true,
      "size": "sm",
      "class": "ps-8"
    },
    {
      "leading": true,
      "size": "md",
      "class": "ps-9"
    },
    {
      "leading": true,
      "size": "lg",
      "class": "ps-10"
    },
    {
      "leading": true,
      "size": "xl",
      "class": "ps-11"
    },
    {
      "trailing": true,
      "size": "xs",
      "class": "pe-7"
    },
    {
      "trailing": true,
      "size": "sm",
      "class": "pe-8"
    },
    {
      "trailing": true,
      "size": "md",
      "class": "pe-9"
    },
    {
      "trailing": true,
      "size": "lg",
      "class": "pe-10"
    },
    {
      "trailing": true,
      "size": "xl",
      "class": "pe-11"
    },
    {
      "loading": true,
      "leading": true,
      "class": {
        "leadingIcon": "animate-spin"
      }
    },
    {
      "loading": true,
      "leading": false,
      "trailing": true,
      "class": {
        "trailingIcon": "animate-spin"
      }
    },
    {
      "fixed": false,
      "size": "xs",
      "class": "md:text-xs"
    },
    {
      "fixed": false,
      "size": "sm",
      "class": "md:text-xs"
    },
    {
      "fixed": false,
      "size": "md",
      "class": "md:text-sm"
    },
    {
      "fixed": false,
      "size": "lg",
      "class": "md:text-sm"
    }
  ],
  "defaultVariants": {
    "size": "md",
    "color": "primary",
    "variant": "outline"
  }
};
const _sfc_main$1 = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UTextarea",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    id: { type: String, required: false },
    name: { type: String, required: false },
    placeholder: { type: String, required: false },
    color: { type: null, required: false },
    variant: { type: null, required: false },
    size: { type: null, required: false },
    required: { type: Boolean, required: false },
    autofocus: { type: Boolean, required: false },
    autofocusDelay: { type: Number, required: false, default: 0 },
    autoresize: { type: Boolean, required: false },
    autoresizeDelay: { type: Number, required: false, default: 0 },
    disabled: { type: Boolean, required: false },
    rows: { type: Number, required: false, default: 3 },
    maxrows: { type: Number, required: false, default: 0 },
    highlight: { type: Boolean, required: false },
    fixed: { type: Boolean, required: false },
    defaultValue: { type: null, required: false },
    modelValue: { type: null, required: false },
    modelModifiers: { type: null, required: false },
    class: { type: null, required: false },
    ui: { type: Object, required: false },
    icon: { type: null, required: false },
    avatar: { type: Object, required: false },
    leading: { type: Boolean, required: false },
    leadingIcon: { type: null, required: false },
    trailing: { type: Boolean, required: false },
    trailingIcon: { type: null, required: false },
    loading: { type: Boolean, required: false },
    loadingIcon: { type: null, required: false }
  },
  emits: ["update:modelValue", "blur", "change"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const _props = __props;
    const emits = __emit;
    const slots = useSlots();
    const props = useComponentProps("textarea", _props);
    const modelValue = useVModel(props, "modelValue", emits, { defaultValue: props.defaultValue });
    const appConfig = useAppConfig();
    const { emitFormFocus, emitFormBlur, emitFormInput, emitFormChange, size, color, id, name, highlight, disabled, ariaAttrs } = useFormField(_props, { deferInputValidation: true });
    const { isLeading, isTrailing, leadingIconName, trailingIconName } = useComponentIcons(props);
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.textarea || {} })({
      color: color.value ?? props.color,
      variant: props.variant,
      size: size?.value ?? props.size,
      loading: props.loading,
      highlight: highlight.value ?? props.highlight,
      fixed: props.fixed,
      autoresize: props.autoresize,
      leading: isLeading.value || !!props.avatar || !!slots.leading,
      trailing: isTrailing.value || !!slots.trailing
    }));
    const textareaRef = useTemplateRef("textareaRef");
    function updateInput(value) {
      if (props.modelModifiers?.trim && (typeof value === "string" || value === null || value === void 0)) {
        value = value?.trim() ?? null;
      }
      if (props.modelModifiers?.number) {
        value = looseToNumber(value);
      }
      if (props.modelModifiers?.nullable) {
        value ||= null;
      }
      if (props.modelModifiers?.optional && !props.modelModifiers?.nullable && value !== null) {
        value ||= void 0;
      }
      modelValue.value = value;
      emitFormInput();
    }
    function onInput(event) {
      autoResize();
      if (!props.modelModifiers?.lazy) {
        updateInput(event.target.value);
      }
    }
    function onChange(event) {
      const value = event.target.value;
      if (props.modelModifiers?.lazy) {
        updateInput(value);
      }
      if (props.modelModifiers?.trim) {
        event.target.value = value.trim();
      }
      emitFormChange();
      emits("change", event);
    }
    function onBlur(event) {
      emitFormBlur();
      emits("blur", event);
    }
    function autoResize() {
      if (props.autoresize && textareaRef.value) {
        textareaRef.value.rows = props.rows;
        const overflow = textareaRef.value.style.overflow;
        textareaRef.value.style.overflow = "hidden";
        const styles = (void 0).getComputedStyle(textareaRef.value);
        const paddingTop = Number.parseInt(styles.paddingTop);
        const paddingBottom = Number.parseInt(styles.paddingBottom);
        const padding = paddingTop + paddingBottom;
        const lineHeight = Number.parseInt(styles.lineHeight);
        const { scrollHeight } = textareaRef.value;
        const newRows = (scrollHeight - padding) / lineHeight;
        if (newRows > props.rows) {
          textareaRef.value.rows = props.maxrows ? Math.min(newRows, props.maxrows) : newRows;
        }
        textareaRef.value.style.overflow = overflow;
      }
    }
    watch(modelValue, () => {
      nextTick(autoResize);
    });
    __expose({
      textareaRef,
      autoResize
    });
    return (_ctx, _push, _parent, _attrs) => {
      let _temp0;
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: unref(props).as,
        "data-slot": "root",
        class: ui.value.root({ class: [unref(props).ui?.root, unref(props).class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<textarea${ssrRenderAttrs(_temp0 = mergeProps({
              id: unref(id),
              ref_key: "textareaRef",
              ref: textareaRef,
              value: unref(modelValue),
              name: unref(name),
              rows: unref(props).rows,
              placeholder: unref(props).placeholder,
              "data-slot": "base",
              class: ui.value.base({ class: unref(props).ui?.base }),
              disabled: unref(disabled),
              required: unref(props).required
            }, { ..._ctx.$attrs, ...unref(ariaAttrs) }), "textarea")}${_scopeId}>${ssrInterpolate("value" in _temp0 ? _temp0.value : "")}</textarea>`);
            ssrRenderSlot(_ctx.$slots, "default", { ui: ui.value }, null, _push2, _parent2, _scopeId);
            if (unref(isLeading) || !!unref(props).avatar || !!slots.leading) {
              _push2(`<span data-slot="leading" class="${ssrRenderClass(ui.value.leading({ class: unref(props).ui?.leading }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "leading", { ui: ui.value }, () => {
                if (unref(isLeading) && unref(leadingIconName)) {
                  _push2(ssrRenderComponent(_sfc_main$2, {
                    name: unref(leadingIconName),
                    "data-slot": "leadingIcon",
                    class: ui.value.leadingIcon({ class: unref(props).ui?.leadingIcon })
                  }, null, _parent2, _scopeId));
                } else if (!!unref(props).avatar) {
                  _push2(ssrRenderComponent(_sfc_main$3, mergeProps({
                    size: unref(props).ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                  }, unref(props).avatar, {
                    "data-slot": "leadingAvatar",
                    class: ui.value.leadingAvatar({ class: unref(props).ui?.leadingAvatar })
                  }), null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
              }, _push2, _parent2, _scopeId);
              _push2(`</span>`);
            } else {
              _push2(`<!---->`);
            }
            if (unref(isTrailing) || !!slots.trailing) {
              _push2(`<span data-slot="trailing" class="${ssrRenderClass(ui.value.trailing({ class: unref(props).ui?.trailing }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "trailing", { ui: ui.value }, () => {
                if (unref(trailingIconName)) {
                  _push2(ssrRenderComponent(_sfc_main$2, {
                    name: unref(trailingIconName),
                    "data-slot": "trailingIcon",
                    class: ui.value.trailingIcon({ class: unref(props).ui?.trailingIcon })
                  }, null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
              }, _push2, _parent2, _scopeId);
              _push2(`</span>`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              createVNode("textarea", mergeProps({
                id: unref(id),
                ref_key: "textareaRef",
                ref: textareaRef,
                value: unref(modelValue),
                name: unref(name),
                rows: unref(props).rows,
                placeholder: unref(props).placeholder,
                "data-slot": "base",
                class: ui.value.base({ class: unref(props).ui?.base }),
                disabled: unref(disabled),
                required: unref(props).required
              }, { ..._ctx.$attrs, ...unref(ariaAttrs) }, {
                onInput,
                onBlur,
                onChange,
                onFocus: unref(emitFormFocus)
              }), null, 16, ["id", "value", "name", "rows", "placeholder", "disabled", "required", "onFocus"]),
              renderSlot(_ctx.$slots, "default", { ui: ui.value }),
              unref(isLeading) || !!unref(props).avatar || !!slots.leading ? (openBlock(), createBlock("span", {
                key: 0,
                "data-slot": "leading",
                class: ui.value.leading({ class: unref(props).ui?.leading })
              }, [
                renderSlot(_ctx.$slots, "leading", { ui: ui.value }, () => [
                  unref(isLeading) && unref(leadingIconName) ? (openBlock(), createBlock(_sfc_main$2, {
                    key: 0,
                    name: unref(leadingIconName),
                    "data-slot": "leadingIcon",
                    class: ui.value.leadingIcon({ class: unref(props).ui?.leadingIcon })
                  }, null, 8, ["name", "class"])) : !!unref(props).avatar ? (openBlock(), createBlock(_sfc_main$3, mergeProps({
                    key: 1,
                    size: unref(props).ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                  }, unref(props).avatar, {
                    "data-slot": "leadingAvatar",
                    class: ui.value.leadingAvatar({ class: unref(props).ui?.leadingAvatar })
                  }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                ])
              ], 2)) : createCommentVNode("", true),
              unref(isTrailing) || !!slots.trailing ? (openBlock(), createBlock("span", {
                key: 1,
                "data-slot": "trailing",
                class: ui.value.trailing({ class: unref(props).ui?.trailing })
              }, [
                renderSlot(_ctx.$slots, "trailing", { ui: ui.value }, () => [
                  unref(trailingIconName) ? (openBlock(), createBlock(_sfc_main$2, {
                    key: 0,
                    name: unref(trailingIconName),
                    "data-slot": "trailingIcon",
                    class: ui.value.trailingIcon({ class: unref(props).ui?.trailingIcon })
                  }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                ])
              ], 2)) : createCommentVNode("", true)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/@nuxt/ui/dist/runtime/components/Textarea.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch(
      "/api/tickets",
      "$_ZnT9GIEAc"
      /* nuxt-injected */
    )), __temp = await __temp, __restore(), __temp);
    const filing = ref(false);
    const form = reactive({ repo: "", prompt: "", title: "" });
    const toast = useToast();
    async function fileTicket() {
      filing.value = true;
      try {
        const r = await $fetch("/api/tickets", {
          method: "POST",
          body: { repo: form.repo, prompt: form.prompt, title: form.title || void 0 }
        });
        toast.add({ title: `Ticket ${r.ticket.id} filed`, color: "success" });
        form.prompt = "";
        form.title = "";
        refresh();
      } catch (e) {
        toast.add({ title: "Failed to file ticket", description: String(e), color: "error" });
      } finally {
        filing.value = false;
      }
    }
    const statusColor = {
      done: "success",
      errored: "error",
      terminated: "neutral",
      queued: "neutral"
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$4;
      const _component_UInput = _sfc_main$5;
      const _component_UTextarea = _sfc_main$1;
      const _component_UButton = _sfc_main$6;
      const _component_UBadge = _sfc_main$7;
      const _component_NuxtLink = __nuxt_component_0;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "space-y-6" }, _attrs))}>`);
      _push(ssrRenderComponent(_component_UCard, null, {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="font-semibold"${_scopeId}>File a ticket</div>`);
          } else {
            return [
              createVNode("div", { class: "font-semibold" }, "File a ticket")
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="space-y-3"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UInput, {
              modelValue: unref(form).repo,
              "onUpdate:modelValue": ($event) => unref(form).repo = $event,
              placeholder: "https://github.com/user/repo",
              icon: "i-lucide-github",
              class: "w-full"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UTextarea, {
              modelValue: unref(form).prompt,
              "onUpdate:modelValue": ($event) => unref(form).prompt = $event,
              placeholder: "What should the agent do? Scope, constraints, acceptance criteria…",
              rows: 3,
              class: "w-full"
            }, null, _parent2, _scopeId));
            _push2(`<div class="flex gap-3"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UInput, {
              modelValue: unref(form).title,
              "onUpdate:modelValue": ($event) => unref(form).title = $event,
              placeholder: "Title (optional)",
              class: "flex-1"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UButton, {
              loading: unref(filing),
              disabled: !unref(form).repo || !unref(form).prompt,
              onClick: fileTicket
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(` Dispatch `);
                } else {
                  return [
                    createTextVNode(" Dispatch ")
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div></div>`);
          } else {
            return [
              createVNode("div", { class: "space-y-3" }, [
                createVNode(_component_UInput, {
                  modelValue: unref(form).repo,
                  "onUpdate:modelValue": ($event) => unref(form).repo = $event,
                  placeholder: "https://github.com/user/repo",
                  icon: "i-lucide-github",
                  class: "w-full"
                }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                createVNode(_component_UTextarea, {
                  modelValue: unref(form).prompt,
                  "onUpdate:modelValue": ($event) => unref(form).prompt = $event,
                  placeholder: "What should the agent do? Scope, constraints, acceptance criteria…",
                  rows: 3,
                  class: "w-full"
                }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                createVNode("div", { class: "flex gap-3" }, [
                  createVNode(_component_UInput, {
                    modelValue: unref(form).title,
                    "onUpdate:modelValue": ($event) => unref(form).title = $event,
                    placeholder: "Title (optional)",
                    class: "flex-1"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createVNode(_component_UButton, {
                    loading: unref(filing),
                    disabled: !unref(form).repo || !unref(form).prompt,
                    onClick: fileTicket
                  }, {
                    default: withCtx(() => [
                      createTextVNode(" Dispatch ")
                    ]),
                    _: 1
                  }, 8, ["loading", "disabled"])
                ])
              ])
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(ssrRenderComponent(_component_UCard, null, {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between"${_scopeId}><div class="font-semibold"${_scopeId}>Fleet</div>`);
            _push2(ssrRenderComponent(_component_UButton, {
              variant: "ghost",
              icon: "i-lucide-refresh-cw",
              size: "xs",
              onClick: ($event) => unref(refresh)()
            }, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", { class: "font-semibold" }, "Fleet"),
                createVNode(_component_UButton, {
                  variant: "ghost",
                  icon: "i-lucide-refresh-cw",
                  size: "xs",
                  onClick: ($event) => unref(refresh)()
                }, null, 8, ["onClick"])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!unref(data)?.tickets?.length) {
              _push2(`<div class="text-muted text-sm"${_scopeId}>No tickets yet.</div>`);
            } else {
              _push2(`<ul class="divide-y divide-default"${_scopeId}><!--[-->`);
              ssrRenderList(unref(data).tickets, (t) => {
                _push2(`<li class="py-3 flex items-center gap-3"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UBadge, {
                  color: statusColor[t.status] ?? "primary",
                  variant: "subtle"
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`${ssrInterpolate(t.status)}`);
                    } else {
                      return [
                        createTextVNode(toDisplayString(t.status), 1)
                      ];
                    }
                  }),
                  _: 2
                }, _parent2, _scopeId));
                _push2(ssrRenderComponent(_component_NuxtLink, {
                  to: `/tickets/${t.id}`,
                  class: "font-medium hover:underline truncate"
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`${ssrInterpolate(t.title)}`);
                    } else {
                      return [
                        createTextVNode(toDisplayString(t.title), 1)
                      ];
                    }
                  }),
                  _: 2
                }, _parent2, _scopeId));
                _push2(`<span class="text-muted text-xs truncate hidden sm:inline"${_scopeId}>${ssrInterpolate(t.repo.replace("https://github.com/", ""))}</span><div class="ml-auto flex items-center gap-2 shrink-0"${_scopeId}>`);
                if (t.prUrl) {
                  _push2(ssrRenderComponent(_component_UButton, {
                    to: t.prUrl,
                    target: "_blank",
                    size: "xs",
                    variant: "soft",
                    icon: "i-lucide-git-pull-request"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(` PR `);
                      } else {
                        return [
                          createTextVNode(" PR ")
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
                _push2(`<span class="text-muted text-xs"${_scopeId}>${ssrInterpolate(new Date(t.updatedAt).toLocaleTimeString())}</span></div></li>`);
              });
              _push2(`<!--]--></ul>`);
            }
          } else {
            return [
              !unref(data)?.tickets?.length ? (openBlock(), createBlock("div", {
                key: 0,
                class: "text-muted text-sm"
              }, "No tickets yet.")) : (openBlock(), createBlock("ul", {
                key: 1,
                class: "divide-y divide-default"
              }, [
                (openBlock(true), createBlock(Fragment, null, renderList(unref(data).tickets, (t) => {
                  return openBlock(), createBlock("li", {
                    key: t.id,
                    class: "py-3 flex items-center gap-3"
                  }, [
                    createVNode(_component_UBadge, {
                      color: statusColor[t.status] ?? "primary",
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(t.status), 1)
                      ]),
                      _: 2
                    }, 1032, ["color"]),
                    createVNode(_component_NuxtLink, {
                      to: `/tickets/${t.id}`,
                      class: "font-medium hover:underline truncate"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(t.title), 1)
                      ]),
                      _: 2
                    }, 1032, ["to"]),
                    createVNode("span", { class: "text-muted text-xs truncate hidden sm:inline" }, toDisplayString(t.repo.replace("https://github.com/", "")), 1),
                    createVNode("div", { class: "ml-auto flex items-center gap-2 shrink-0" }, [
                      t.prUrl ? (openBlock(), createBlock(_component_UButton, {
                        key: 0,
                        to: t.prUrl,
                        target: "_blank",
                        size: "xs",
                        variant: "soft",
                        icon: "i-lucide-git-pull-request"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(" PR ")
                        ]),
                        _: 1
                      }, 8, ["to"])) : createCommentVNode("", true),
                      createVNode("span", { class: "text-muted text-xs" }, toDisplayString(new Date(t.updatedAt).toLocaleTimeString()), 1)
                    ])
                  ]);
                }), 128))
              ]))
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
export {
  _sfc_main as default
};
//# sourceMappingURL=index-nyPSRBJl.js.map
