FROM docker.io/cloudflare/sandbox:0.12.3

# ffmpeg: browser_record assembles GIFs from browser-plane frame captures
# (native beats ffmpeg.wasm — this is a full container, no need for wasm).
#
# xvfb: a virtual X display, so Chrome can run HEADFUL. This is not cosmetic —
# bot-detection vendors (PerimeterX and similar) deny headless Chrome outright.
# Measured against talbots.com: headless is blocked 3/3, headful passes 3/3
# (11.7KB of real content, 122 interactive refs). Chrome headful REQUIRES an X
# display on Linux; without DISPLAY it fails to launch at all, so Xvfb is what
# makes the capability reachable in a container.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg xvfb \
  && rm -rf /var/lib/apt/lists/*

# agent-browser: persistent session browser (AX snapshots, click/fill,
# screenshot, read, tabs, har). Pre-install Chrome during image build
# so cold sandboxes don't pay the download tax.
RUN npm install -g agent-browser && agent-browser install
COPY worker/sandbox/agent-browser.sh /usr/local/bin/agent-browser-wrapper
# cache bust: 2026-07-23 flue-first tool collapse (no sandbox extensions)

# Bake the agent runtime into the image so sandboxes don't pay per-run
# installs (disk is ephemeral; runtime installs are wasted work).
#
# Under the flue-first engine the agent loop runs in the Worker; the sandbox
# is just the workspace + tool exec. So the image bakes toolchains the
# worker-side tools shell out to (agent-browser, aft, imgup) — NOT Pi tool
# extensions (there are none anymore).
#
# 1. /opt/agent: Pi CLI + a `pi` shim on PATH (residual Pi tooling / warmup).
# 2. Pi home via worker/sandbox/install.mjs: packages from worker/sandbox/pi.json
#    (auth, magic context, aft-pi). No extension discovery.
# 3. AFT (CortexKit) wired via its own installer (also downloads the aft
#    binary the aft_* tools exec + registers npm:@cortexkit/aft-pi).
# 4. Warmup run: Pi installs all settings.json packages into its cache at
#    build time (exits nonzero without auth — fine).
COPY worker/sandbox /opt/agent/sandbox

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
