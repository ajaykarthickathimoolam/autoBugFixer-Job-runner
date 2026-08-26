FROM eclipse-temurin:25-jdk-noble AS jdk

FROM node:22-bookworm-slim

# git + ssh for cloning/pushing, build-essential as a generic baseline, plus JDK 25 + Maven
# so Java services (e.g. icd-coder) can actually compile instead of failing on --release 25.
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    ca-certificates \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

ARG MAVEN_VERSION=3.9.11
RUN curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" \
      | tar -xz -C /opt \
    && ln -s "/opt/apache-maven-${MAVEN_VERSION}/bin/mvn" /usr/local/bin/mvn

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
