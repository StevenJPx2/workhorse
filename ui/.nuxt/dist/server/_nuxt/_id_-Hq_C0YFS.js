import { a as useRoute, b as useToast, c as _sfc_main$1, d as _sfc_main$2 } from "../server.mjs";
import { u as useFetch, _ as _sfc_main$3 } from "./fetch-Zx8SmWud.js";
import { defineComponent, withAsyncContext, ref, computed, unref, mergeProps, withCtx, createTextVNode, toDisplayString, createVNode, openBlock, createBlock, createCommentVNode, Fragment, renderList, useSSRContext } from "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/vue/index.mjs";
import { ssrRenderAttrs, ssrRenderComponent, ssrInterpolate, ssrRenderList } from "vue/server-renderer";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/@nuxt/nitro-server/dist/runtime/h3-compat.mjs";
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
import "@vueuse/core";
import "@vueuse/shared";
import "tailwind-variants";
import "@iconify/utils/lib/css/icon";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/ohash/dist/index.mjs";
import "/Users/stevenjohn/Documents/Projects/workhorse/ui/node_modules/perfect-debounce/dist/index.mjs";
import "ohash/utils";
import "@floating-ui/vue";
import "aria-hidden";
import "@vue/shared";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "[id]",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const route = useRoute();
    const id = route.params.id;
    const { data, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch(
      `/api/tickets/${id}`,
      "$3aoW_jWZMz"
      /* nuxt-injected */
    )), __temp = await __temp, __restore(), __temp);
    const { data: diffData } = ([__temp, __restore] = withAsyncContext(() => useFetch(
      `/api/tickets/${id}/diff`,
      {
        lazy: true,
        server: false
      },
      "$7mFqSVZeGe"
      /* nuxt-injected */
    )), __temp = await __temp, __restore(), __temp);
    const { data: activity, refresh: refreshActivity } = ([__temp, __restore] = withAsyncContext(() => useFetch(
      `/api/tickets/${id}/activity`,
      { lazy: true, server: false },
      "$fghj75jThw"
      /* nuxt-injected */
    )), __temp = await __temp, __restore(), __temp);
    function eventLabel(e) {
      const kind = e.type ?? e.event ?? "event";
      const detail = e.tool ?? e.name ?? e.message ?? (e.raw ? e.raw.slice(0, 120) : "");
      return detail ? `${kind} · ${String(detail).slice(0, 160)}` : String(kind);
    }
    function eventTime(e) {
      const t = e.ts ?? e.timestamp;
      return t ? new Date(String(t)).toLocaleTimeString() : "";
    }
    const toast = useToast();
    const stopping = ref(false);
    async function stop() {
      stopping.value = true;
      try {
        await $fetch(`/api/tickets/${id}/stop`, { method: "POST" });
        toast.add({ title: "Stop signal sent", color: "warning" });
        refresh();
      } catch (e) {
        toast.add({ title: "Stop failed", description: String(e), color: "error" });
      } finally {
        stopping.value = false;
      }
    }
    const running = computed(
      () => ["queued", "planning", "implementing"].includes(data.value?.ticket?.status ?? "")
    );
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UButton = _sfc_main$1;
      const _component_UBadge = _sfc_main$2;
      const _component_UCard = _sfc_main$3;
      if (unref(data)) {
        _push(`<div${ssrRenderAttrs(mergeProps({ class: "space-y-4" }, _attrs))}><div class="flex items-center gap-3">`);
        _push(ssrRenderComponent(_component_UButton, {
          to: "/",
          variant: "ghost",
          icon: "i-lucide-arrow-left",
          size: "xs"
        }, null, _parent));
        _push(`<h1 class="text-xl font-bold">${ssrInterpolate(unref(data).ticket.title)}</h1>`);
        _push(ssrRenderComponent(_component_UBadge, { variant: "subtle" }, {
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`${ssrInterpolate(unref(data).ticket.status)}`);
            } else {
              return [
                createTextVNode(toDisplayString(unref(data).ticket.status), 1)
              ];
            }
          }),
          _: 1
        }, _parent));
        _push(`<div class="ml-auto flex gap-2">`);
        if (unref(running)) {
          _push(ssrRenderComponent(_component_UButton, {
            color: "warning",
            variant: "soft",
            icon: "i-lucide-octagon-x",
            loading: unref(stopping),
            onClick: stop
          }, {
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(` Stop `);
              } else {
                return [
                  createTextVNode(" Stop ")
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        if (unref(data).ticket.prUrl) {
          _push(ssrRenderComponent(_component_UButton, {
            to: unref(data).ticket.prUrl,
            target: "_blank",
            icon: "i-lucide-git-pull-request"
          }, {
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(` Open PR `);
              } else {
                return [
                  createTextVNode(" Open PR ")
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        _push(`</div></div>`);
        _push(ssrRenderComponent(_component_UCard, null, {
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<div class="text-sm space-y-1"${_scopeId}><div${_scopeId}><span class="text-muted"${_scopeId}>repo:</span> ${ssrInterpolate(unref(data).ticket.repo)}</div><div${_scopeId}><span class="text-muted"${_scopeId}>workflow:</span> ${ssrInterpolate(unref(data).workflow?.status ?? "n/a")}</div>`);
              if (unref(data).ticket.branch) {
                _push2(`<div${_scopeId}><span class="text-muted"${_scopeId}>branch:</span> ${ssrInterpolate(unref(data).ticket.branch)}</div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(data).ticket.error) {
                _push2(`<div class="text-error"${_scopeId}>${ssrInterpolate(unref(data).ticket.error)}</div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
            } else {
              return [
                createVNode("div", { class: "text-sm space-y-1" }, [
                  createVNode("div", null, [
                    createVNode("span", { class: "text-muted" }, "repo:"),
                    createTextVNode(" " + toDisplayString(unref(data).ticket.repo), 1)
                  ]),
                  createVNode("div", null, [
                    createVNode("span", { class: "text-muted" }, "workflow:"),
                    createTextVNode(" " + toDisplayString(unref(data).workflow?.status ?? "n/a"), 1)
                  ]),
                  unref(data).ticket.branch ? (openBlock(), createBlock("div", { key: 0 }, [
                    createVNode("span", { class: "text-muted" }, "branch:"),
                    createTextVNode(" " + toDisplayString(unref(data).ticket.branch), 1)
                  ])) : createCommentVNode("", true),
                  unref(data).ticket.error ? (openBlock(), createBlock("div", {
                    key: 1,
                    class: "text-error"
                  }, toDisplayString(unref(data).ticket.error), 1)) : createCommentVNode("", true)
                ])
              ];
            }
          }),
          _: 1
        }, _parent));
        _push(ssrRenderComponent(_component_UCard, null, {
          header: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<div class="font-semibold"${_scopeId}>Task</div>`);
            } else {
              return [
                createVNode("div", { class: "font-semibold" }, "Task")
              ];
            }
          }),
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<p class="text-sm whitespace-pre-wrap"${_scopeId}>${ssrInterpolate(unref(data).ticket.prompt)}</p>`);
            } else {
              return [
                createVNode("p", { class: "text-sm whitespace-pre-wrap" }, toDisplayString(unref(data).ticket.prompt), 1)
              ];
            }
          }),
          _: 1
        }, _parent));
        if (unref(data).ticket.result) {
          _push(ssrRenderComponent(_component_UCard, null, {
            header: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="font-semibold"${_scopeId}>Result</div>`);
              } else {
                return [
                  createVNode("div", { class: "font-semibold" }, "Result")
                ];
              }
            }),
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<pre class="text-xs whitespace-pre-wrap overflow-x-auto"${_scopeId}>${ssrInterpolate(unref(data).ticket.result)}</pre>`);
              } else {
                return [
                  createVNode("pre", { class: "text-xs whitespace-pre-wrap overflow-x-auto" }, toDisplayString(unref(data).ticket.result), 1)
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        if (unref(diffData)?.diff) {
          _push(ssrRenderComponent(_component_UCard, null, {
            header: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="font-semibold"${_scopeId}>Diff</div>`);
              } else {
                return [
                  createVNode("div", { class: "font-semibold" }, "Diff")
                ];
              }
            }),
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<pre class="text-xs overflow-x-auto max-h-96"${_scopeId}>${ssrInterpolate(unref(diffData).diff)}</pre>`);
              } else {
                return [
                  createVNode("pre", { class: "text-xs overflow-x-auto max-h-96" }, toDisplayString(unref(diffData).diff), 1)
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        if (unref(activity)?.tasks?.length) {
          _push(ssrRenderComponent(_component_UCard, null, {
            header: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="flex items-center justify-between"${_scopeId}><div class="font-semibold"${_scopeId}>Activity</div><div class="flex items-center gap-2"${_scopeId}><span class="text-muted text-xs"${_scopeId}>run ${ssrInterpolate(unref(activity).runId)}</span>`);
                _push2(ssrRenderComponent(_component_UButton, {
                  variant: "ghost",
                  size: "xs",
                  icon: "i-lucide-refresh-cw",
                  onClick: ($event) => unref(refreshActivity)()
                }, null, _parent2, _scopeId));
                _push2(`</div></div>`);
              } else {
                return [
                  createVNode("div", { class: "flex items-center justify-between" }, [
                    createVNode("div", { class: "font-semibold" }, "Activity"),
                    createVNode("div", { class: "flex items-center gap-2" }, [
                      createVNode("span", { class: "text-muted text-xs" }, "run " + toDisplayString(unref(activity).runId), 1),
                      createVNode(_component_UButton, {
                        variant: "ghost",
                        size: "xs",
                        icon: "i-lucide-refresh-cw",
                        onClick: ($event) => unref(refreshActivity)()
                      }, null, 8, ["onClick"])
                    ])
                  ])
                ];
              }
            }),
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="space-y-4"${_scopeId}><!--[-->`);
                ssrRenderList(unref(activity).tasks, (task) => {
                  _push2(`<div${_scopeId}><div class="flex items-center gap-2 mb-1"${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: task.status === "completed" ? "success" : task.status === "failed" ? "error" : "primary",
                    variant: "subtle",
                    size: "sm"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`${ssrInterpolate(task.status)}`);
                      } else {
                        return [
                          createTextVNode(toDisplayString(task.status), 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(`<span class="font-medium text-sm"${_scopeId}>${ssrInterpolate(task.id)}</span>`);
                  if (task.completedAt) {
                    _push2(`<span class="text-muted text-xs ml-auto"${_scopeId}>${ssrInterpolate(new Date(task.completedAt).toLocaleTimeString())}</span>`);
                  } else {
                    _push2(`<!---->`);
                  }
                  _push2(`</div>`);
                  if (task.events.length) {
                    _push2(`<ol class="border-l border-default ml-1 pl-3 space-y-1 max-h-64 overflow-y-auto"${_scopeId}><!--[-->`);
                    ssrRenderList(task.events, (e, i) => {
                      _push2(`<li class="text-xs flex gap-2"${_scopeId}><span class="text-muted shrink-0 w-16"${_scopeId}>${ssrInterpolate(eventTime(e))}</span><span class="truncate"${_scopeId}>${ssrInterpolate(eventLabel(e))}</span></li>`);
                    });
                    _push2(`<!--]--></ol>`);
                  } else {
                    _push2(`<div class="text-muted text-xs ml-4"${_scopeId}>no recorded events</div>`);
                  }
                  _push2(`</div>`);
                });
                _push2(`<!--]--></div>`);
              } else {
                return [
                  createVNode("div", { class: "space-y-4" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(activity).tasks, (task) => {
                      return openBlock(), createBlock("div", {
                        key: task.id
                      }, [
                        createVNode("div", { class: "flex items-center gap-2 mb-1" }, [
                          createVNode(_component_UBadge, {
                            color: task.status === "completed" ? "success" : task.status === "failed" ? "error" : "primary",
                            variant: "subtle",
                            size: "sm"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(task.status), 1)
                            ]),
                            _: 2
                          }, 1032, ["color"]),
                          createVNode("span", { class: "font-medium text-sm" }, toDisplayString(task.id), 1),
                          task.completedAt ? (openBlock(), createBlock("span", {
                            key: 0,
                            class: "text-muted text-xs ml-auto"
                          }, toDisplayString(new Date(task.completedAt).toLocaleTimeString()), 1)) : createCommentVNode("", true)
                        ]),
                        task.events.length ? (openBlock(), createBlock("ol", {
                          key: 0,
                          class: "border-l border-default ml-1 pl-3 space-y-1 max-h-64 overflow-y-auto"
                        }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(task.events, (e, i) => {
                            return openBlock(), createBlock("li", {
                              key: i,
                              class: "text-xs flex gap-2"
                            }, [
                              createVNode("span", { class: "text-muted shrink-0 w-16" }, toDisplayString(eventTime(e)), 1),
                              createVNode("span", { class: "truncate" }, toDisplayString(eventLabel(e)), 1)
                            ]);
                          }), 128))
                        ])) : (openBlock(), createBlock("div", {
                          key: 1,
                          class: "text-muted text-xs ml-4"
                        }, "no recorded events"))
                      ]);
                    }), 128))
                  ])
                ];
              }
            }),
            _: 1
          }, _parent));
        } else if (unref(activity)?.note) {
          _push(ssrRenderComponent(_component_UCard, null, {
            header: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="font-semibold"${_scopeId}>Activity</div>`);
              } else {
                return [
                  createVNode("div", { class: "font-semibold" }, "Activity")
                ];
              }
            }),
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="text-muted text-sm"${_scopeId}>${ssrInterpolate(unref(activity).note)}</div>`);
              } else {
                return [
                  createVNode("div", { class: "text-muted text-sm" }, toDisplayString(unref(activity).note), 1)
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        _push(`</div>`);
      } else {
        _push(`<!---->`);
      }
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/tickets/[id].vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
export {
  _sfc_main as default
};
//# sourceMappingURL=_id_-Hq_C0YFS.js.map
