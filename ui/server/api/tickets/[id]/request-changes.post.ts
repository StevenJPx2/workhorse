export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readBody(event);
  return workhorse(event, `/tickets/${id}/request-changes`, {
    method: "POST",
    body: JSON.stringify(body),
  });
});
