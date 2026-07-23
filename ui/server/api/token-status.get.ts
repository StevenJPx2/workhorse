// Credential health proxy — surfaces custodian OAuth token freshness (never
// the token) for the home-page model-credential tile.
export default defineEventHandler((event) => workhorse(event, "/token"));
