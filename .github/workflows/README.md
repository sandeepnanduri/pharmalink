# CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every push, every PR | lint + typecheck + unit tests (blocking); e2e (reports only) |
| `deploy-oci.yml` | push to `develop`, or manual | verify → build image → push to GHCR → pull and restart on the OCI VM |

## Before the first deploy

The deploy job cannot work until these exist. Everything else has a default.

### Secrets — Settings → Secrets and variables → Actions → Secrets

| Name | Value |
|---|---|
| `OCI_SSH_HOST` | the VM's public IP or hostname |
| `OCI_SSH_USER` | `ubuntu` on an Ubuntu image, `opc` on Oracle Linux |
| `OCI_SSH_KEY` | the **private** key, whole file including the BEGIN/END lines |
| `OCI_SSH_KNOWN_HOSTS` | optional, recommended — output of `ssh-keyscan <host>` |

Without `OCI_SSH_KNOWN_HOSTS` the job trusts the host key on first sight and
logs a warning. That is a real gap, not a formality: the job pipes a registry
token over the channel, so an on-path attacker impersonating the VM would
receive it. One `ssh-keyscan` closes it.

### Variables — same page, Variables tab

| Name | Default | Notes |
|---|---|---|
| `SITE_URL` | *(none)* | e.g. `https://pharmaconnectb2b.duckdns.org`. **Baked into the browser bundle at build time** — changing it requires a rebuild, not an `.env` edit. |
| `DEPLOY_PLATFORM` | `linux/amd64` | `linux/arm64` for the `VM.Standard.A1.Flex` shape. Also selects the runner, so the build is native rather than emulated. |
| `REMOTE_DIR` | `pharmalink/deploy/oci` | path on the VM, relative to the login user's home |

### On the VM, once

The workflow deliberately never writes the VM's `.env` — rotating a production
secret should not be a side effect of pushing code. Create it by hand at
`~/pharmalink/deploy/oci/.env`:

```ini
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://your-host
NEXT_PUBLIC_SITE_URL=https://your-host
SITE_ADDRESS=your-host
# optional SSO
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

The VM also needs to reach `ghcr.io` outbound (it does by default) and to
accept SSH from the GitHub Actions runners. If port 22 is restricted to your
own address in the OCI security list, the deploy will hang and then time out —
that is the first thing to check when a deploy fails at the SSH step.

### GHCR package visibility

The first successful build creates `ghcr.io/<owner>/pharmalink` as a **private**
package even though the repository is public. The deploy handles that: it logs
in with the job's own token, which can read packages owned by this repository.
Making the package public is optional and only matters if you want to
`docker pull` it from somewhere without credentials.

## Deploying

Merging to `develop` deploys. The image is tagged with the commit SHA, so a
rollback is a tag away:

```bash
# on the VM
cd ~/pharmalink/deploy/oci
APP_IMAGE=ghcr.io/<owner>/pharmalink:<older-sha> docker compose -f docker-compose.prebuilt.yml up -d
```

The deploy does this for you automatically if the new image fails its
healthcheck — it puts the previous image back and fails the run. Re-running
`workflow_dispatch` rolls forward again.

## Why e2e does not block

205 Playwright specs, of which roughly five fail per run — and *which* five
changes between runs. The suite runs `workers: 1` against one shared SQLite
fixture and specs mutate rows other specs assert on; running the same failures
together makes them pass. Blocking on it would block every merge for reasons
unrelated to the change under review, which is how a gate gets deleted.

It still runs on every push and uploads its report, so a real regression is
visible. When the fixture is per-spec, drop `continue-on-error` from `ci.yml`
and add the job to the deploy gate.
