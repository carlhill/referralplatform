# syntax=docker/dockerfile:1.7
#
# Build context is the MONOREPO ROOT, not this directory — this service depends
# on workspace packages (shared-types, audit-client, auth-client). See
# docker-compose.yml, and root CONVENTIONS.md ("Docker build context") for why.
#
#   docker build -f services/identity-access/Dockerfile -t referralplatform/identity-access-service .

FROM node:20-alpine AS builder
WORKDIR /workspace
COPY . .
RUN npm install --workspaces --include-workspace-root
RUN npm run build -w packages/shared-types -w packages/audit-client -w packages/auth-client -w services/identity-access

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace /workspace
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "services/identity-access/dist/main.js"]
