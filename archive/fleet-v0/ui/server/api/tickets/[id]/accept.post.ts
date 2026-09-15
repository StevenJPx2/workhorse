export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  return workhorse(event, `/tickets/${id}/accept`, { method: "POST", body: "{}" });
});
