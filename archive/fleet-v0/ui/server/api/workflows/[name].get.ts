export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name");
  const entry = await workhorse(event, `/workflows/${name}`);
  // The worker returns the entry unwrapped; page code consumes { workflow }.
  return { workflow: entry };
});
