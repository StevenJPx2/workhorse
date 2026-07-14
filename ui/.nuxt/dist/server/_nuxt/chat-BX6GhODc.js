import { _ as _sfc_main$1 } from "./Input-BuhyYZlo.js";
import { c as _sfc_main$2 } from "../server.mjs";
import { defineComponent, ref, mergeProps, unref, isRef, nextTick, useSSRContext } from "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/vue/index.mjs";
import { ssrRenderAttrs, ssrRenderList, ssrRenderClass, ssrInterpolate, ssrRenderComponent } from "vue/server-renderer";
import "@vueuse/core";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/ofetch/dist/node.mjs";
import "#internal/nuxt/paths";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/hookable/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/unctx/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/@nuxt/nitro-server/dist/runtime/h3-compat.mjs";
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
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/ohash/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/perfect-debounce/dist/index.mjs";
import "ohash/utils";
import "@floating-ui/vue";
import "aria-hidden";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "chat",
  __ssrInlineRender: true,
  setup(__props) {
    const messages = ref([]);
    const input = ref("");
    const busy = ref(false);
    const box = ref();
    async function send() {
      const content = input.value.trim();
      if (!content || busy.value) return;
      messages.value.push({ role: "user", content });
      input.value = "";
      busy.value = true;
      await nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight }));
      try {
        const r = await $fetch("/api/chat", {
          method: "POST",
          body: { messages: messages.value.slice(-12) }
        });
        messages.value.push({ role: "assistant", content: r.reply });
      } catch (e) {
        messages.value.push({ role: "assistant", content: `⚠️ ${String(e)}` });
      } finally {
        busy.value = false;
        await nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight }));
      }
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UInput = _sfc_main$1;
      const _component_UButton = _sfc_main$2;
      _push(`<div${ssrRenderAttrs(mergeProps({
        class: "flex flex-col",
        style: { "height": "calc(100vh - 8rem)" }
      }, _attrs))}><div class="flex-1 overflow-y-auto space-y-3 pb-4">`);
      if (!unref(messages).length) {
        _push(`<div class="text-muted text-sm pt-8 text-center"> Talk to the fleet agent — file tickets, check status, stop runs, steer work.<br> e.g. <em>&quot;What&#39;s running right now?&quot;</em> · <em>&quot;Stop ticket 1dc5f927 and refile it with a stricter scope&quot;</em></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`<!--[-->`);
      ssrRenderList(unref(messages), (m, i) => {
        _push(`<div class="${ssrRenderClass([m.role === "user" ? "justify-end" : "justify-start", "flex"])}"><div class="${ssrRenderClass([m.role === "user" ? "bg-primary/10" : "bg-elevated", "rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap"])}">${ssrInterpolate(m.content)}</div></div>`);
      });
      _push(`<!--]-->`);
      if (unref(busy)) {
        _push(`<div class="text-muted text-sm animate-pulse">agent thinking…</div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div><div class="flex gap-2 pt-2 border-t border-default">`);
      _push(ssrRenderComponent(_component_UInput, {
        modelValue: unref(input),
        "onUpdate:modelValue": ($event) => isRef(input) ? input.value = $event : null,
        class: "flex-1",
        placeholder: "Message the fleet agent…",
        disabled: unref(busy),
        onKeydown: send
      }, null, _parent));
      _push(ssrRenderComponent(_component_UButton, {
        loading: unref(busy),
        disabled: !unref(input).trim(),
        icon: "i-lucide-send",
        onClick: send
      }, null, _parent));
      _push(`</div></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/chat.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
export {
  _sfc_main as default
};
//# sourceMappingURL=chat-BX6GhODc.js.map
