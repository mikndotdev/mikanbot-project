# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# OpenSSL is required for Prisma to connect to databases
RUN apt update && apt install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# install dependencies into a temp directory
# this caches them and speeds up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# run the bot directly from source so native modules (sharp/staticmaps) work
FROM base AS release
ENV NODE_ENV=production
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Generate the Prisma client
RUN bunx --bun prisma generate

# Drop privileges using the non-root user shipped in the Bun image
RUN chown -R bun:bun /usr/src/app
USER bun

EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "src/index.ts" ]
