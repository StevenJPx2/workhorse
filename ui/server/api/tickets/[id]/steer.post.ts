export default defineEventHandler(async (event) =>
  workhorse(event, `/tickets/${getRouterParam(event, "id")}/steer`, {
    method: "POST",
    body: JSON.stringify(await readBody(event)),
  }),
);
