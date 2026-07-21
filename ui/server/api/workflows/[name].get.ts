export default defineEventHandler((event) => {
  const name = getRouterParam(event, "name");
  return workhorse(event, `/workflows/${name}`);
});
