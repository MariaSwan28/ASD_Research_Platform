FROM node:22-bookworm-slim

WORKDIR /app

# Use HTTPS and retry transient download failures; keep TLS verification enabled.
RUN set -eux; \
    if [ ! -s /etc/ssl/certs/ca-certificates.crt ]; then \
        mkdir -p /etc/ssl/certs; \
        node -e "require('fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('tls').rootCertificates.join('\n') + '\n')"; \
    fi; \
    for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do \
        if [ -f "$source" ]; then \
            sed -i 's|http://deb.debian.org|https://deb.debian.org|g; s|http://security.debian.org|https://security.debian.org|g' "$source"; \
        fi; \
    done; \
    printf '%s\n' 'Acquire::Retries "5";' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' > /etc/apt/apt.conf.d/80-network-retries; \
    apt-get -o APT::Update::Error-Mode=any update; \
    apt-get install -y --no-install-recommends ca-certificates python3 make g++ libsqlite3-dev ffmpeg; \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev

COPY . .

RUN mkdir -p files static dataset data

EXPOSE 5000

CMD ["node", "index.js"]