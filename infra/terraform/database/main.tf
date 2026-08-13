# infra/terraform/database — the shared Postgres instance and its per-service
# schemas, plus (documented here, provisioned separately) immudb and Redis.
#
# NOT applied against any real cloud account yet — see root CONVENTIONS.md
# ("Infrastructure as code") and claude/solution-architecture-tech-stack.md.
#
# Intended scope, once built out:
#   - One managed PostgreSQL instance (AWS RDS/Aurora PostgreSQL) per
#     environment — see root CONVENTIONS.md ("Database access / ORM") for
#     why one instance with per-service schemas was chosen over one database
#     per microservice for this platform's scale.
#   - A Postgres role + schema per service in services/*, created here (not
#     by application code) so schema existence and access boundaries are
#     reviewable infrastructure, not implicit. Each service's own Prisma
#     migrations then run against its schema only.
#   - Encryption at rest (KMS-backed), automated backups meeting the
#     documented RPO (15 minutes) and multi-AZ per the RTO/RPO non-functional
#     requirements in claude/modules-and-requirements.md.
#   - Redis (ElastiCache) for caching/session state/rate limiting.
#   - immudb is intentionally NOT an RDS-managed service (no AWS-managed
#     immudb offering) — it runs as a container (ECS service, see
#     infra/terraform/ecs) with its own EBS-backed persistent volume; this
#     module still owns its KMS key and backup/retention policy since it
#     holds the platform's non-repudiation audit trail.

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  description = "From infra/terraform/network."
  type        = string
  default     = null
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "service_schemas" {
  description = "One schema per services/* directory — kept in sync manually for now; see root CONVENTIONS.md."
  type        = list(string)
  default = [
    "audit_log", "identity_access", "onboarding_account", "gp_authorisation",
    "consent_security", "referral", "directory", "booking", "specialist_review",
    "followup_recall", "notification", "admin_console",
  ]
}

output "postgres_endpoint" {
  value       = null
  description = "Placeholder — replace with aws_db_instance.main.endpoint once implemented."
}
