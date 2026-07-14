ARG BASE_IMAGE=debian:bookworm-slim
FROM ${BASE_IMAGE}

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    binwalk \
    ca-certificates \
    curl \
    file \
    git \
    nmap \
    nikto \
    python3 \
    python3-pip \
    sqlmap \
    tcpdump \
    tshark \
    unzip \
    yara \
    && rm -rf /var/lib/apt/lists/*

ARG SEMGREP_VERSION=1.127.1
RUN pip3 install --break-system-packages --no-cache-dir "semgrep==${SEMGREP_VERSION}"

ARG NUCLEI_VERSION
ARG NUCLEI_URL
ARG NUCLEI_SHA256
RUN test -n "${NUCLEI_VERSION}" \
    && test -n "${NUCLEI_URL}" \
    && test -n "${NUCLEI_SHA256}" \
    && curl --fail --location --output /tmp/nuclei.zip "${NUCLEI_URL}" \
    && echo "${NUCLEI_SHA256}  /tmp/nuclei.zip" | sha256sum --check - \
    && unzip -q /tmp/nuclei.zip -d /usr/local/bin \
    && rm /tmp/nuclei.zip

RUN useradd --create-home --uid 10001 ego-tool \
    && mkdir -p /workspace /tmp/ego-tool \
    && chown -R ego-tool:ego-tool /workspace /tmp/ego-tool

USER ego-tool
WORKDIR /workspace
ENV HOME=/home/ego-tool TMPDIR=/tmp/ego-tool
ENTRYPOINT ["/usr/bin/env"]
