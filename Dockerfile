FROM node:lts-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Enable pnpm
RUN corepack enable pnpm

# Copy contents of the local source directory to the bot's directory
COPY . /app

# Set it as the current working directory
WORKDIR /app

# Install main dependencies only
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Build the app
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

# Run the bot
CMD [ "pnpm", "start" ]

# docker build --tag autobot .
# docker run --detach --name autobot-container --env-file ./.env autobot
