# infra/terraform/secrets — application secrets and HSM-backed signing keys.
#
# NOT applied against any real cloud account yet — see root CONVENTIONS.md
# ("Infrastructure as code") and claude/solution-architecture-tech-stack.md
# ("Secrets and key management").
#
# Intended scope, once built out — deliberately TWO different mechanisms,
# not one, because they have genuinely different risk profiles:
#
#   1. AWS Secrets Manager for ordinary application secrets: database
#      credentials, Keycloak client secrets, third-party API keys. Rotated
#      on a schedule, referenced by ECS task definitions at runtime (never
#      baked into an image or committed as a real .env — see each service's
#      .env.example for the placeholder values local dev uses instead).
#
#   2. AWS KMS with CloudHSM-backed keys (or an actual HSM if NASH
#      requirements demand it) for anything the platform's non-repudiation
#      and crypto-shredding claims actually depend on:
#        - NASH organisation/signing certificates (audit-log-service's
#          signing operations — see claude/audit-log-architecture-decision.md)
#        - Per-user crypto-shredding keys (object storage encryption —
#          "delete" = destroy the key, not the file; see
#          claude/solution-architecture-tech-stack.md, "Object storage" row)
#      These must never live in Secrets Manager, an environment variable, or
#      a database column — that's what makes the non-repudiation claim in
#      the audit log design actually true rather than asserted.

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

output "kms_nash_signing_key_arn" {
  value       = null
  description = "Placeholder — CloudHSM-backed KMS key ARN for NASH signing, once implemented."
}

output "kms_crypto_shredding_key_arn" {
  value       = null
  description = "Placeholder — CloudHSM-backed KMS key ARN used to derive per-user crypto-shredding keys, once implemented."
}
