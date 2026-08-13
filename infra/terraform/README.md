# infra/terraform

Module-directory-structure-only, per root `CONVENTIONS.md` and
`claude/solution-architecture-tech-stack.md` ("Infrastructure as code and CI/CD").
**Nothing here has been applied against any real cloud account.** Each `main.tf`
documents that module's intended scope and exposes placeholder outputs so the
modules can already reference each other's interfaces before they're implemented.

| Module      | Owns                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------- |
| `network/`  | VPC, subnets (public/private, multi-AZ), routing, security groups                           |
| `database/` | The shared Postgres instance + per-service schemas, Redis, immudb's backing storage         |
| `ecs/`      | The Phase 1 compute runtime (ECS Fargate) — cluster, services, ALB, task IAM roles          |
| `secrets/`  | AWS Secrets Manager (ordinary secrets) + KMS/CloudHSM (NASH signing, crypto-shredding keys) |

## Rules for this directory, per root CONVENTIONS.md

- **Every environment (dev/staging/prod) is a separate AWS account**, provisioned
  entirely from these modules — no manual console changes, ever, including in dev.
- **AU data residency is a hard constraint** — `ap-southeast-2` (Sydney) primary,
  Melbourne documented as DR, for every environment, not just production.
- A module's `main.tf` is the place to record _why_ a decision was made, not just
  _what_ resources exist — future contributors (human or agent) should be able to
  read a module's header comment and understand its scope without archaeology.

## When this actually gets built out

Terraform state should live in a remote backend (S3 + DynamoDB lock table) provisioned
once, outside these modules (a bootstrap step) — not decided yet, flagged here so
whoever picks this up doesn't default to local state.
