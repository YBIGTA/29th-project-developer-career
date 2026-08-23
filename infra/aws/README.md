# DevCompass daily AWS workflow

This directory defines the scheduled orchestration for both data pipelines.

```text
EventBridge Scheduler
  -> Step Functions Standard Workflow
     -> Parallel
        -> Fargate Task A: jobs collection and enrichment -> RDS
        -> Fargate Task B: ecosystem metrics -> RDS
  -> both branches must succeed
  -> FastAPI reads the latest successful database views
```

EventBridge Scheduler only starts the workflow. Step Functions does not contain
the Python application code; it starts revision-pinned ECS task definitions and
waits for their containers to finish.

## Prerequisites

- Task A and Task B images are pushed to ECR.
- Revision-pinned ECS task definitions are registered for both images.
- The task definitions inject RDS credentials and API secrets from Secrets
  Manager or SSM Parameter Store.
- `PrivateSubnetIds` are public subnets (route to an Internet Gateway) — tasks
  run with `AssignPublicIp: ENABLED` and get a public IP for outbound access to
  RDS, ATS, GitHub, and Stack Exchange APIs. No inbound rule is opened, so
  tasks stay unreachable from the internet despite the public IP.
- The ECS task execution role can pull images and read configured secrets.
- The security groups allow PostgreSQL traffic to the RDS security group.

Task B requires `GITHUB_TOKEN`. `STACKEXCHANGE_KEY` is optional but recommended.

## Database deployment order

Apply the SQL files before running Task B:

```text
db/jobs/schema.sql
db/jobs/views.sql
db/ecosystem/schema.sql
db/ecosystem/views.sql
```

## Deploy

Replace the placeholder values in `parameters.example.json` with the actual
cluster, task definition, role, subnet, and security group values. Keep the
environment-specific parameter file untracked.

```bash
aws cloudformation deploy \
  --region ap-northeast-2 \
  --stack-name devcompass-jobs-workflow \
  --template-file infra/aws/jobs-workflow.yaml \
  --parameter-overrides file://infra/aws/parameters.dev.json \
  --capabilities CAPABILITY_NAMED_IAM
```

The schedule is `DISABLED` by default. Start the state machine manually, inspect
both container logs and RDS run records, and enable the schedule only after the
full workflow succeeds.

## Continuous deployment

`.github/workflows/deploy-jobs.yaml` and `deploy-ecosystem.yaml` push to `main`
under `pipelines/jobs/**` or `pipelines/ecosystem/**` and redeploy this stack:
build the image, push to ECR, register a new task definition revision by
cloning the current live definition and swapping only the image, then update
this stack's `TaskATaskDefinitionArn`/`TaskBTaskDefinitionArn` parameter to the
new revision ARN (both call the shared `deploy-pipeline.yaml` workflow).

Task definitions stay revision-pinned by design — a new revision only takes
effect once this step updates the stack parameter, it is never picked up
implicitly.

Requires an `AWS_DEPLOY_ROLE_ARN` repository secret: an IAM role trusted for
GitHub Actions OIDC with permission to push to both ECR repositories,
`ecs:DescribeTaskDefinition` / `RegisterTaskDefinition`, and
`cloudformation:DescribeStacks` / `CreateChangeSet` / `ExecuteChangeSet` on this
stack (plus `iam:PassRole` for `TaskExecutionRoleArn` and `TaskRoleArn`).

## Runtime contract

Both branches receive the same Step Functions execution name as
`DEVCOMPASS_WORKFLOW_RUN_ID`. Task A also receives it as `DEVCOMPASS_RUN_ID`.
Task B uses the workflow ID to resume only missing or failed source rows when an
ECS attempt is retried.

Each ECS task has its own timeout and retry policy. The workflow explicitly
checks the essential container exit code, and one failed branch makes the whole
parallel workflow fail. Scheduler delivery failures are sent to the SQS dead
letter queue, while workflow failures and timeouts publish CloudWatch alarms to
the SNS topic created by the stack.
