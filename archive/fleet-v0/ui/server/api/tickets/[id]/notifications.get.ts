export default defineEventHandler((event) => {
  const id = getRouterParam(event, "id");
  return workhorse(event, `/tickets/${id}/notifications`);
});
