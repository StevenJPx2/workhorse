// Entry point required by wrangler.toml. The tests never fetch this worker —
// they import Db directly and run inside the same isolate — but wrangler needs a
// `main` to resolve the config.
export default {
  fetch: () => new Response("db test harness"),
};
