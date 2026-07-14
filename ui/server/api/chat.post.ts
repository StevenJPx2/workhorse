export default defineEventHandler(async (event) => {
  const body = await readBody<{ messages: Array<{ role: string; content: string }> }>(event);
  return workhorse(event, "/chat", { method: "POST", body: JSON.stringify(body) });
});
