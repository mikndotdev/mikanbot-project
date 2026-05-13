# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# OpenSSL is required for Prisma to connect to databases
RUN apt update
RUN apt install -y openssl

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# copy Prisma schema and generate Prisma client
COPY prisma /temp/dev/prisma
RUN cd /temp/dev && bunx prisma generate

# copy source files and build the binary
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
RUN bun run build

# create minimal runtime image
FROM debian:bookworm-slim AS release
WORKDIR /usr/src/app

# Install OpenSSL for Prisma
RUN apt update && apt install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy only the compiled binary
COPY --from=build /usr/src/app/mikanbot .

# Create a non-root user and switch to it
RUN useradd -m -u 1000 mikanbot && chown -R mikanbot:mikanbot /usr/src/app
USER mikanbot

EXPOSE 3000/tcp
ENTRYPOINT [ "./mikanbot" ]