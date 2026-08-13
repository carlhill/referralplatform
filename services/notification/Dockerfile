# syntax=docker/dockerfile:1.7
#
# Build context is the MONOREPO ROOT, not this directory — this service depends
# on workspace packages (shared-types, audit-client, auth-client). See
# docker-compose.yml, and root CONVENTIONS.md ("Docker build context") for why.
#
#   docker build -f services/notification/Dockerfile -t referralplatform/notification-service .

FROM node:20-alpine AS builder
WORKDIR /workspace
COPY . .
RUN npm install --workspaces --include-workspace-root
RUN npm run build -w packages/shared-types -w packages/audit-client -w packages/auth-client -w services/notification

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace /workspace
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://localhost:3010/health || exit 1
CMD ["node", "services/notification/dist/main.js"]
