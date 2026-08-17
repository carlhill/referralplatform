# syntax=docker/dockerfile:1.7
#
# Build context is the MONOREPO ROOT, not this directory — this service depends
# on workspace packages (shared-types, audit-client, auth-client). See
# docker-compose.yml, and root CONVENTIONS.md ("Docker build context") for why.
#
#   docker build -f services/notification/Dockerfile -t referralplatform/notification-service .

FROM node:20-alpine AS builder
WORKDIR /workspace
# Copy only what `npm install` actually needs (root + this service's
# dependency workspaces' package.json, plus the lockfile) before installing —
# see CONVENTIONS.md §9. `COPY . .` up front means ANY file changing
# anywhere in the whole monorepo invalidates the expensive install layer's
# cache too, even a one-line unrelated source edit; splitting it like this
# means only a package.json/lockfile change forces a reinstall.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/audit-client/package.json packages/audit-client/package.json
COPY packages/audit-outbox/package.json packages/audit-outbox/package.json
COPY packages/auth-client/package.json packages/auth-client/package.json
COPY services/notification/package.json services/notification/package.json
COPY certs ./certs
# Local machines behind a TLS-inspecting proxy/antivirus can drop a root CA at
# certs/local-ca.pem (gitignored, absent on other machines) - Node just warns
# and continues if it's missing. Also upgrades past a known npm 10.8.x "Exit
# handler never called!" crash on large workspace installs. ENV (not a
# per-RUN export) so it's still in scope for prisma:generate/build below.
ENV NODE_EXTRA_CA_CERTS=/workspace/certs/local-ca.pem
RUN npm install -g npm@11 && \
    npm install --workspaces --include-workspace-root
COPY . .
RUN npm run prisma:generate -w services/notification
RUN npm run build -w packages/shared-types -w packages/audit-client -w packages/audit-outbox -w packages/auth-client -w services/notification

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace /workspace
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://localhost:3010/health || exit 1
CMD ["node", "services/notification/dist/main.js"]
