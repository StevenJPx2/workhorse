export default defineEventHandler((event) =>
  workhorse(event, `/tickets/${getRouterParam(event, "id")}/traces`),
);
