export default defineEventHandler((event) =>
  workhorse(event, `/tickets/${getRouterParam(event, "id")}/heal`, { method: "POST" }),
);
