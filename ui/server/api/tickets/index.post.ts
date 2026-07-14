export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return workhorse(event, "/tickets", { method: "POST", body: JSON.stringify(body) });
});
