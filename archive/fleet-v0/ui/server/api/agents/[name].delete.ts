export default defineEventHandler((event) => {
  const name = getRouterParam(event, "name");
  return workhorse(event, `/agents/${name}`, { method: "DELETE" });
});
