# syntax=docker/dockerfile:1.7
#
# Build context is the MONOREPO ROOT — this app depends on workspace packages
# (shared-types, ui-components). See docker-compose.yml.
#
#   docker build -f apps/gp-portal/Dockerfile -t referralplatform/gp-portal .

FROM node:20-alpine AS builder
WORKDIR /workspace
COPY . .
RUN npm install --workspaces --include-workspace-root
RUN npm run build -w packages/shared-types -w packages/ui-components -w apps/gp-portal

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace /workspace
EXPOSE 3100
CMD ["npm", "run", "start", "-w", "apps/gp-portal"]
