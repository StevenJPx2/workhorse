FROM docker.io/cloudflare/sandbox:0.12.3

# Bake the agent runtime into the image so sandboxes don't pay per-run
# installs (disk is ephemeral; runtime installs are wasted work).
#
# 1. /opt/agent: Pi CLI + a `pi` shim on PATH (pi-subagent spawns `pi`).
# 2. Pi home via sandbox/install.mjs: packages from sandbox/pi.json;
#    sandbox tools DISCOVERED from plugins/*/extension.ts (adding a plugin
#    with a sandbox half = drop an extension.ts in its folder). Build
#    context is the REPO ROOT (wrangler image_build_context) so the image
#    sees the plugins workspace. Stage gating stays declarative: a
#    plugin's tools are callable in a workflow stage only if that stage's
#    tools[] names them (pi-workflow).
# 3. AFT (CortexKit) wired via its own installer (also downloads the aft
#    binary + registers npm:@cortexkit/aft-pi).
# 4. Warmup run: Pi installs all settings.json packages into its cache at
#    build time (exits nonzero without auth — fine). At runtime only
#    auth.json (short-lived access token) is injected.
COPY sandbox /opt/agent/sandbox
COPY plugins /opt/agent/plugins

RUN mkdir -p /opt/agent /root/.pi/agent/agents \
  && cd /opt/agent \
  && npm init -y >/dev/null \
  && npm install --omit=dev @earendil-works/pi-coding-agent \
  && printf '#!/bin/sh\nexec node /opt/agent/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"\n' > /usr/local/bin/pi \
  && chmod +x /usr/local/bin/pi \
  && node /opt/agent/sandbox/install.mjs \
  && cp /opt/agent/sandbox/agents/*.md /root/.pi/agent/agents/ \
  && npx -y @cortexkit/aft@latest setup --harness pi \
  && (timeout 300 pi -p -np "warmup" || true) \
  && ls /root/.pi/agent/npm/node_modules/@cortexkit

# Magic Context: config + bake the local embedding model (~90MB ONNX) so
# sandboxes never download it at runtime. The context.db itself is restored
# per-repo from KV at prepare and persisted back after each run (agent-run.ts).
RUN mkdir -p /root/.config/cortexkit \
  && cp /opt/agent/sandbox/magic-context.jsonc /root/.config/cortexkit/magic-context.jsonc
RUN MC_MODELS=/root/.local/share/cortexkit/magic-context/models/Xenova/all-MiniLM-L6-v2 \
  && mkdir -p "$MC_MODELS/onnx" \
  && curl -fsSL -o "$MC_MODELS/config.json" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json \
  && curl -fsSL -o "$MC_MODELS/tokenizer.json" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json \
  && curl -fsSL -o "$MC_MODELS/tokenizer_config.json" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json \
  && curl -fsSL -o "$MC_MODELS/onnx/model.onnx" https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx

# imgup (images-upload-cli): the upload_image tool shells out to it to host
# screenshots. Single keyless hosts are individually unreliable (catbox
# throttles datacenter IPs, 0x0.st disabled uploads), so imgup's breadth —
# a default host plus a fallback chain across 30+ hosts — is the robustness.
# It is a Python CLI and the base image has no python3, so bootstrap with uv
# (one static binary that provisions its own managed Python), then symlink
# imgup onto the global PATH so the workflow agent finds it regardless of its
# shell PATH.
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin INSTALLER_NO_MODIFY_PATH=1 sh \
  && uv tool install images-upload-cli \
  && ln -sf /root/.local/bin/imgup /usr/local/bin/imgup \
  && imgup --help >/dev/null \
  && echo "imgup baked OK"

EXPOSE 8080
