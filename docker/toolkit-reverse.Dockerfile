ARG BASE_IMAGE=debian:bookworm-slim
FROM ${BASE_IMAGE}

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    apktool \
    binutils \
    binwalk \
    ca-certificates \
    curl \
    file \
    jadx \
    openjdk-17-jre-headless \
    unzip \
    && rm -rf /var/lib/apt/lists/*

ARG GHIDRA_VERSION
ARG GHIDRA_URL
ARG GHIDRA_SHA256
RUN test -n "${GHIDRA_VERSION}" \
    && test -n "${GHIDRA_URL}" \
    && test -n "${GHIDRA_SHA256}" \
    && curl --fail --location --output /tmp/ghidra.zip "${GHIDRA_URL}" \
    && echo "${GHIDRA_SHA256}  /tmp/ghidra.zip" | sha256sum --check - \
    && unzip -q /tmp/ghidra.zip -d /opt \
    && mv "/opt/ghidra_${GHIDRA_VERSION}_PUBLIC" /opt/ghidra \
    && rm /tmp/ghidra.zip

RUN useradd --create-home --uid 10001 ego-tool \
    && mkdir -p /workspace /tmp/ego-tool \
    && chown -R ego-tool:ego-tool /workspace /tmp/ego-tool

USER ego-tool
WORKDIR /workspace
ENV HOME=/home/ego-tool TMPDIR=/tmp/ego-tool PATH=/opt/ghidra/support:${PATH}
ENTRYPOINT ["/usr/bin/env"]
