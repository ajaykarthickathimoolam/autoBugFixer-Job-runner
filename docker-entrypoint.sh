#!/bin/sh
set -e

# Claude Code CLI refuses --dangerously-skip-permissions when run as root, so this container
# must run the app as the non-root "node" user (built into the base image). Volumes are mounted
# at runtime and typically land owned by root, so fix ownership here (as root, before dropping
# privileges) rather than at image build time.
mkdir -p /workspace /home/node
chown -R node:node /workspace /home/node

exec su node -s /bin/sh -c "exec node src/server.js"
