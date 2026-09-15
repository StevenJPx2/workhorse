export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return workhorse(event, "/attachments/match", {
    method: "POST",
    body: JSON.stringify(body),
  });
});
