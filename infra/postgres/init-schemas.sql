-- Runs once, automatically, the first time the `postgres` container's data
-- volume is created (docker-entrypoint-initdb.d convention — see docker-compose.yml).
--
-- Convention: ONE shared PostgreSQL instance, ONE schema per service — see root
-- CONVENTIONS.md ("Database access / ORM"). This file creates every service's
-- schema up front so each service's own Prisma migrations (`npm run prisma:migrate
-- -w services/<name>`) can run against a schema that already exists, without any
-- service needing CREATE SCHEMA privileges at runtime.
--
-- Keep this list in sync with services/* (and infra/terraform/database/main.tf's
-- `service_schemas` variable, for when that module is actually implemented).

CREATE SCHEMA IF NOT EXISTS audit_log;
CREATE SCHEMA IF NOT EXISTS identity_access;
CREATE SCHEMA IF NOT EXISTS onboarding_account;
CREATE SCHEMA IF NOT EXISTS gp_authorisation;
CREATE SCHEMA IF NOT EXISTS consent_security;
CREATE SCHEMA IF NOT EXISTS referral;
CREATE SCHEMA IF NOT EXISTS directory;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS specialist_review;
CREATE SCHEMA IF NOT EXISTS followup_recall;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS admin_console;

GRANT ALL PRIVILEGES ON SCHEMA
  audit_log, identity_access, onboarding_account, gp_authorisation,
  consent_security, referral, directory, booking, specialist_review,
  followup_recall, notification, admin_console
  TO referralplatform;
