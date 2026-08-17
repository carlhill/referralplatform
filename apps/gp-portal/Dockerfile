# syntax=docker/dockerfile:1.7
#
# Build context is the MONOREPO ROOT — this app depends on workspace packages
# (shared-types, ui-components). See docker-compose.yml.
#
#   docker build -f apps/gp-portal/Dockerfile -t referralplatform/gp-portal .

FROM node:20-alpine AS builder
WORKDIR /workspace
# Copy only what `npm install` actually needs (root + this app's
# dependency workspaces' package.json, plus the lockfile) before installing —
# see CONVENTIONS.md §9. `COPY . .` up front means ANY file changing
# anywhere in the whole monorepo invalidates the expensive install layer's
# cache too, even a one-line unrelated source edit; splitting it like this
# means only a package.json/lockfile change forces a reinstall.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/ui-components/package.json packages/ui-components/package.json
COPY apps/gp-portal/package.json apps/gp-portal/package.json
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
# Next.js inlines NEXT_PUBLIC_* into the client bundle at `next build` time,
# not at container start — docker-compose.yml's `environment:` block alone
# never reaches it. Must come in as build ARGs and be re-exported as ENV
# immediately before the build step. See apps/gp-portal/lib/api/config.ts's
# doc comment and docker-compose.yml's `build.args` for this service.
ARG NEXT_PUBLIC_KEYCLOAK_ISSUER
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
ARG NEXT_PUBLIC_APP_BASE_URL
ARG NEXT_PUBLIC_IDENTITY_ACCESS_URL
ARG NEXT_PUBLIC_ONBOARDING_ACCOUNT_URL
ARG NEXT_PUBLIC_GP_AUTHORISATION_URL
ARG NEXT_PUBLIC_CONSENT_SECURITY_URL
ARG NEXT_PUBLIC_REFERRAL_SERVICE_URL
ARG NEXT_PUBLIC_DIRECTORY_SERVICE_URL
ARG NEXT_PUBLIC_FOLLOWUP_RECALL_URL
ARG NEXT_PUBLIC_NOTIFICATION_SERVICE_URL
ENV NEXT_PUBLIC_KEYCLOAK_ISSUER=$NEXT_PUBLIC_KEYCLOAK_ISSUER \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID \
    NEXT_PUBLIC_APP_BASE_URL=$NEXT_PUBLIC_APP_BASE_URL \
    NEXT_PUBLIC_IDENTITY_ACCESS_URL=$NEXT_PUBLIC_IDENTITY_ACCESS_URL \
    NEXT_PUBLIC_ONBOARDING_ACCOUNT_URL=$NEXT_PUBLIC_ONBOARDING_ACCOUNT_URL \
    NEXT_PUBLIC_GP_AUTHORISATION_URL=$NEXT_PUBLIC_GP_AUTHORISATION_URL \
    NEXT_PUBLIC_CONSENT_SECURITY_URL=$NEXT_PUBLIC_CONSENT_SECURITY_URL \
    NEXT_PUBLIC_REFERRAL_SERVICE_URL=$NEXT_PUBLIC_REFERRAL_SERVICE_URL \
    NEXT_PUBLIC_DIRECTORY_SERVICE_URL=$NEXT_PUBLIC_DIRECTORY_SERVICE_URL \
    NEXT_PUBLIC_FOLLOWUP_RECALL_URL=$NEXT_PUBLIC_FOLLOWUP_RECALL_URL \
    NEXT_PUBLIC_NOTIFICATION_SERVICE_URL=$NEXT_PUBLIC_NOTIFICATION_SERVICE_URL
RUN npm run build -w packages/shared-types -w packages/ui-components -w apps/gp-portal

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace /workspace
EXPOSE 3100
CMD ["npm", "run", "start", "-w", "apps/gp-portal"]
