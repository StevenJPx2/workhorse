import{d as o,w as r,g as t}from"../../../../nitro/nitro.mjs";import"node:events";import"node:process";import"cloudflare:workers";import"node:buffer";import"node:timers";import"node:async_hooks";const e=o(async o=>{const e=await r(o,`/tickets/${t(o,"id")}/diff`);return{diff:String(e)}});export{e as default};
//# sourceMappingURL=diff.get.mjs.map
