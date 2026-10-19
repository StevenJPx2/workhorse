import { bindings, defineConfig, exports } from "cf/config";

// The same dist-rust2/index.js and core.wasm that plain workerd runs in config-rust2.capnp.
export default defineConfig({
	accountId: "7bb7dff27822397d46162181bfedf38d",
	worker: {
		name: "workhorse-spike-mailbox",
		compatibilityDate: "2026-10-01",
		entrypoint: "dist-rust2/index.js",
		workersDev: true,
		env: {
			MAILBOX: bindings.durableObject({
				worker: "workhorse-spike-mailbox",
				exportName: "Mailbox",
			}),
			LOADER: bindings.workerLoader(),
		},
		exports: {
			Mailbox: exports.durableObject({ storage: "sqlite" }),
		},
	},
});
