FROM node:22.23.1-bookworm-slim

WORKDIR /sandbox

COPY employee.mjs worker-entry.mjs probe-entry.mjs hang-entry.mjs /sandbox/

RUN chown -R root:root /sandbox \
  && chmod 0555 /sandbox \
  && chmod 0444 /sandbox/*.mjs

USER 65534:65534

ENTRYPOINT ["node", "--permission", "--allow-fs-read=/sandbox", "--disable-proto=throw", "--no-addons", "--no-global-search-paths", "--no-experimental-websocket", "--max-old-space-size=32", "/sandbox/worker-entry.mjs"]
