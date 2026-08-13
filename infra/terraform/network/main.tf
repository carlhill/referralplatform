# infra/terraform/network — VPC, subnets, routing, security groups.
#
# NOT applied against any real cloud account yet — this is a documented
# placeholder module boundary, per root CONVENTIONS.md ("Infrastructure as
# code") and claude/solution-architecture-tech-stack.md.
#
# Intended scope, once built out:
#   - A VPC per environment (dev/staging/prod are separate AWS accounts —
#     see the tech stack doc's "multi-account pattern" — so this module is
#     applied once per account, not once for the whole platform).
#   - Public subnets (ALB/NAT only) + private subnets (ECS Fargate tasks,
#     RDS) across at least 2 AZs in ap-southeast-2 (Sydney), per the
#     "Multi-AZ deployment within the primary AU region at minimum"
#     non-functional requirement.
#   - Security groups: one per service tier (ALB, ECS tasks, RDS, immudb,
#     Keycloak), least-privilege ingress rules between them — never a
#     single shared "allow all internal" group.
#   - VPC endpoints for S3/Secrets Manager/KMS/ECR so Fargate tasks in
#     private subnets don't need a NAT gateway for AWS API calls (cost +
#     an extra reviewable egress path).
#
# See infra/terraform/database, infra/terraform/ecs, infra/terraform/secrets
# for the modules that consume this one's outputs (vpc_id, subnet ids,
# security group ids).

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
  description = "dev | staging | prod — each is its own AWS account per the tech stack doc's multi-account pattern."
  type        = string
}

variable "region" {
  description = "AU data residency is a hard constraint — see claude/solution-architecture-tech-stack.md."
  type        = string
  default     = "ap-southeast-2"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# --- Placeholder outputs so downstream modules (database/ecs/secrets) have a
# --- stable interface to reference before this module is actually implemented.
output "vpc_id" {
  value       = null
  description = "Placeholder — replace with aws_vpc.main.id once this module is implemented."
}

output "private_subnet_ids" {
  value       = []
  description = "Placeholder — private subnets for ECS Fargate tasks and RDS."
}

output "public_subnet_ids" {
  value       = []
  description = "Placeholder — public subnets for the ALB/NAT gateway only."
}
