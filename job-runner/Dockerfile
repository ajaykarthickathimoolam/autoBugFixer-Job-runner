FROM node:22-bookworm-slim

# git + ssh for cloning/pushing, build-essential as a generic baseline build toolchain.
# NOTE: if target service repos need a specific language toolchain (Java+Maven, Python, Go, ...)
# for their build/test commands, add it here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    ca-certificates \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Pin GitHub's host key at build time so git-over-SSH never falls back to trust-on-first-use.
RUN mkdir -p /etc/ssh && ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> /etc/ssh/ssh_known_hosts 2>/dev/null

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV WORKSPACE_ROOT=/workspace
EXPOSE 4100
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
