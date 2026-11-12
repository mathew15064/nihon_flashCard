# Public-repository credential exposure — containment checklist

Status: **OPEN SECURITY RISK**, recorded 2026-11-12. No credential values are reproduced here.

## Verified facts

- The GitHub repository mathew15064/nihon_flashCard is public.
- In the legacy Express v1 code, DockerFile/.env is tracked by Git and contains non-empty settings named MYSQL_ROOT_PASSWORD and REDIS_PASSWORD.
- Legacy data/users.json is also tracked (despite an ignore rule). Even if it contains only IDs/display names, user information should not be published without review.
- No evidence has established whether those credentials are real, currently deployed, or already rotated. Treat them as potentially compromised until verified.

## Owner/operator actions — DO NOT EXECUTE AUTOMATICALLY

1. Privately identify any active MySQL/Redis instances and credentials using the affected configuration. **Never** paste the secret values into an issue, PR, chat, public log or Google Doc.
2. If credentials have ever been active, rotate both via the respective service/admin console, update deployment secret stores and restart only through an approved change window. Also check reuse on other services.
3. Restrict public network access to those services and review relevant authentication/network audit logs for unexpected access. Treat continued production use of exposed values as unsafe.
4. Ensure all environment files and user data are Git-ignored going forward, and remove those paths from tracking only after checking whether legacy deployment scripts depend on them. Prefer an explicit coordinated security patch rather than destroying legacy configuration on a dev worktree.
5. Historic commits, tags, cached clones and forks may still contain these values after deleting the current files. Decide separately whether repository history rewriting is feasible, with collaborator coordination and backup. **Rotation is mandatory irrespective of history rewrite.**
6. Confirm the privacy expectations of users represented by data/users.json. Avoid publishing full migration reports, usernames or learning histories.

## Boundary for the Fastify branch

- Fastify app/.gitignore already excludes .env.local, SQLite files, backups, logs, and other local data.
- The server-only OpenAI provider key, Admin password hash, REST token and MCP token must stay in private runtime configuration.
- This PR does not rotate any production credential, touch v1 source/data, rewrite Git history, merge, or deploy.

## Close criteria

Credential owner confirms rotation or documents proof the values were never live; public tracking is remediated with a reviewed patch; future deployment configs use a private secret store; privacy review is complete.
