export default defineEventHandler((event) => {
  const repo = getQuery(event).repo;
  return workhorse(event, `/scripts${repo ? `?repo=${encodeURIComponent(String(repo))}` : ""}`);
});
