export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  const body = await readBody(event);
  return workhorse(event, `/agents/${name}`, { method: "PUT", body: JSON.stringify(body) });
});
