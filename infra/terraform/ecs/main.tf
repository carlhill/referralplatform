# infra/terraform/ecs — the Phase 1 compute runtime: AWS ECS Fargate.
#
# NOT applied against any real cloud account yet — see root CONVENTIONS.md
# ("Infrastructure as code") and claude/solution-architecture-tech-stack.md
# ("Containers and orchestration") for why Fargate rather than Kubernetes at
# this stage — same Docker images either way, so moving to EKS later is an
# infra change, not a rewrite.
#
# Intended scope, once built out:
#   - One ECS cluster per environment.
#   - One ECS service + task definition per entry in services/* and apps/*
#     (mirrors docker-compose.yml's service list one-for-one, so local dev
#     and the real deployment target stay conceptually identical) — task
#     definitions reference images built from each service's Dockerfile and
#     pushed to ECR by the CI pipeline (.github/workflows/ci.yml).
#   - An Application Load Balancer with path/host-based routing to each
#     service, TLS termination (ACM cert), and WAF in front of internet-facing
#     routes (the three portals' public entry points).
#   - Task-level IAM roles scoped per service (least privilege — a service
#     should only be able to read the Secrets Manager secrets and S3 prefixes
#     it actually needs), autoscaling policies, and CloudWatch/OpenTelemetry
#     log/metric export per claude/solution-architecture-tech-stack.md
#     ("Observability").
#   - Fargate tasks run in the private subnets from infra/terraform/network.

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
  type    = string
  default = null
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "services" {
  description = "Mirrors docker-compose.yml's service list — kept in sync manually for now."
  type        = list(string)
  default = [
    "audit-log", "identity-access", "onboarding-account", "gp-authorisation",
    "consent-security", "referral", "directory", "booking", "specialist-review",
    "followup-recall", "notification", "admin-console", "fhir-gateway",
    "gp-portal", "specialist-portal", "patient-web",
  ]
}

output "cluster_arn" {
  value       = null
  description = "Placeholder — replace with aws_ecs_cluster.main.arn once implemented."
}
