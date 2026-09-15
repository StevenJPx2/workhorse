export default defineEventHandler(async (event) => {
  const diff = await workhorse(event, `/tickets/${getRouterParam(event, "id")}/diff`);
  return { diff: String(diff) };
});
