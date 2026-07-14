FROM docker.io/cloudflare/sandbox:0.12.3

# Bake the agent runtime into the image so sandboxes don't pay a per-run
# npm install (disk is ephemeral; runtime installs are wasted work).
#
# 1. /opt/agent: Pi CLI + deps.
# 2. /root/.pi/agent: settings.json referencing the OAuth extension (Claude
#    subscription) and pi-workflow (staged workflow engine, PINNED — fast-
#    moving dep, upgrade deliberately). A warmup run makes Pi install both
#    extensions into its cache at build time (exits nonzero without auth —
#    fine). At runtime only auth.json (short-lived access token) is injected.
# 3. /opt/agent/bundles: Workhorse workflow specs + agents, copied into the
#    ticket repo / Pi home at run time.
COPY bundles /opt/agent/bundles

RUN mkdir -p /opt/agent /root/.pi/agent/agents \
  && cd /opt/agent \
  && npm init -y >/dev/null \
  && npm install --omit=dev @earendil-works/pi-coding-agent \
  && printf '#!/bin/sh\nexec node /opt/agent/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"\n' > /usr/local/bin/pi \
  && chmod +x /usr/local/bin/pi \
  && printf '%s\n' \
    '{"packages":["npm:@gotgenes/pi-anthropic-auth","npm:@agwab/pi-workflow@0.8.0"],"defaultProvider":"anthropic","defaultModel":"claude-sonnet-4-6"}' \
    > /root/.pi/agent/settings.json \
  && cp /opt/agent/bundles/agents/*.md /root/.pi/agent/agents/ \
  && (timeout 180 node /opt/agent/node_modules/@earendil-works/pi-coding-agent/dist/cli.js -p -np "warmup" || true) \
  && ls /root/.pi/agent/npm/node_modules/@agwab 2>/dev/null || echo "NOTE: pi-workflow cache dir differs; extension installs on first run"

EXPOSE 8080
