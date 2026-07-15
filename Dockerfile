FROM docker.io/cloudflare/sandbox:0.12.3

# Bake the agent runtime into the image so sandboxes don't pay per-run
# installs (disk is ephemeral; runtime installs are wasted work).
#
# 1. /opt/agent: Pi CLI + a `pi` shim on PATH (pi-subagent spawns `pi`).
# 2. Pi home from bundles/plugins.json via install-plugins.mjs — adding a
#    plugin is ONE LINE there (+ optional .ts under bundles/extensions/).
#    Stage gating stays declarative: a plugin's tools are callable in a
#    workflow stage only if that stage's tools[] names them (pi-workflow).
# 3. AFT (CortexKit) wired via its own installer (also downloads the aft
#    binary + registers npm:@cortexkit/aft-pi).
# 4. Warmup run: Pi installs all settings.json packages into its cache at
#    build time (exits nonzero without auth — fine). At runtime only
#    auth.json (short-lived access token) is injected.
COPY bundles /opt/agent/bundles

RUN mkdir -p /opt/agent /root/.pi/agent/agents \
  && cd /opt/agent \
  && npm init -y >/dev/null \
  && npm install --omit=dev @earendil-works/pi-coding-agent \
  && printf '#!/bin/sh\nexec node /opt/agent/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"\n' > /usr/local/bin/pi \
  && chmod +x /usr/local/bin/pi \
  && node /opt/agent/bundles/install-plugins.mjs \
  && cp /opt/agent/bundles/agents/*.md /root/.pi/agent/agents/ \
  && npx -y @cortexkit/aft@latest setup --harness pi \
  && (timeout 300 pi -p -np "warmup" || true) \
  && ls /root/.pi/agent/npm/node_modules/@agwab /root/.pi/agent/npm/node_modules/@cortexkit

# Magic Context: config + bake the local embedding model (~90MB ONNX) so
# sandboxes never download it at runtime. The context.db itself is restored
# per-repo from KV at prepare and persisted back after each run (agent-run.ts).
RUN mkdir -p /root/.config/cortexkit \
  && cp /opt/agent/bundles/magic-context.jsonc /root/.config/cortexkit/magic-context.jsonc
RUN MC_MODELS=/root/.local/share/cortexkit/magic-context/models/Xenova/all-MiniLM-L6-v2 \
  && mkdir -p "$MC_MODELS/onnx" \
  && curl -fsSL -o "$MC_MODELS/config.json" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json \
  && curl -fsSL -o "$MC_MODELS/tokenizer.json" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json \
  && curl -fsSL -o "$MC_MODELS/tokenizer_config.json" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json \
  && curl -fsSL -o "$MC_MODELS/onnx/model.onnx" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx

EXPOSE 8080
