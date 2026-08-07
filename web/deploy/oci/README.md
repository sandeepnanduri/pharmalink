# Deploying PharmaLink to Oracle Cloud (Always Free)

A complete walkthrough for running PharmaLink on an OCI **Always Free** VM: a
real always-on server with a persistent disk, at no cost and with no expiry.

Unlike the serverless free tiers, nothing here is ephemeral — the SQLite
database and uploaded documents live on the instance's block volume and survive
restarts, redeploys and reboots.

**What you end up with:** `https://your-name.duckdns.org` serving the app over
HTTPS with an auto-renewing Let's Encrypt certificate, behind a Caddy reverse
proxy, on a 2-core / 12 GB ARM VM that costs nothing.

| File | Role |
|------|------|
| `bootstrap.sh` | Run once on the VM: installs Docker, opens the local firewall |
| `ship.ps1` | Run on Windows: uploads the source to the VM |
| `docker-compose.oci.yml` | The stack — app container + Caddy TLS proxy |
| `Caddyfile` | Reverse proxy / automatic HTTPS config |
| `.env.oci.example` | Template for the VM's `.env` |

---

## Before you start

You need the OCI account (card required for identity verification — Always Free
resources are not charged) and roughly 30 minutes, most of which is the VM
waiting to provision and the first Docker build.

> **On "Always Free" limits.** Oracle halved the free ARM allocation on
> **15 June 2026**, from 4 OCPU / 24 GB down to **2 OCPU / 12 GB**. That is
> still ample for this app. Note the free ARM capacity is genuinely scarce in
> popular regions — see [Troubleshooting](#out-of-capacity-when-creating-the-vm)
> if creation fails.

---

## 1. Create the VM

In the OCI console: **Compute → Instances → Create instance**.

| Setting | Value |
|---------|-------|
| Image | **Canonical Ubuntu 24.04** |
| Shape | **VM.Standard.A1.Flex**, 2 OCPU, 12 GB — the Always Free ARM shape |
| Boot volume | 50 GB (free tier allows up to 200 GB total) |
| SSH keys | **Save the private key** — it is the only way in |

Ubuntu's default login user is `ubuntu`. (If you pick an Oracle Linux image
instead, it's `opc` — pass `-User opc` to `ship.ps1` later.)

Make sure the instance gets a **public IPv4 address** (the default for a public
subnet). Note it down; the rest of this guide calls it `<VM_IP>`.

Confirm you can get in:

```powershell
ssh -i ~\.ssh\your_key ubuntu@<VM_IP>
```

## 2. Open ports 80 and 443 — *both* layers

OCI has **two independent firewalls**, and you must open both. This is the
number one reason a working OCI deployment appears dead.

**Layer 1 — the virtual network (console).** Go to your instance → click the
**subnet** → click the **Security List** → **Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port Range |
|-------------|-------------|------------------------|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

**Layer 2 — the firewall inside the VM.** Handled for you by `bootstrap.sh` in
the next step. Ubuntu images on OCI ship an iptables ruleset that rejects
essentially everything except SSH, and it is not obvious it's there.

## 3. Install Docker on the VM

Copy the bootstrap script up and run it:

```powershell
scp -i ~\.ssh\your_key .\bootstrap.sh ubuntu@<VM_IP>:~/
ssh -i ~\.ssh\your_key ubuntu@<VM_IP> "chmod +x bootstrap.sh && ./bootstrap.sh"
```

It installs Docker Engine + the Compose plugin, opens tcp/80 and tcp/443 in the
local firewall (persisting the rules across reboots), and adds a swapfile if the
machine has under 4 GB of RAM.

Then **log out and back in** so your shell picks up the new `docker` group:

```powershell
ssh -i ~\.ssh\your_key ubuntu@<VM_IP> "docker run --rm hello-world"
```

## 4. Point a hostname at the VM

HTTPS needs a hostname — Let's Encrypt will not issue a certificate for a bare
IP address.

**Free option (no domain needed): [DuckDNS](https://www.duckdns.org).** Sign in
with GitHub/Google, pick a subdomain, and set its IP to `<VM_IP>`. You get
`your-name.duckdns.org` in a few seconds, free and permanently.

**If you own a domain,** just add an `A` record pointing at `<VM_IP>`.

> Avoid the `nip.io` / `sslip.io` wildcard-DNS trick. It resolves fine, but
> those domains have **exhausted their Let's Encrypt certificate rate limits**,
> so issuance fails unpredictably.

Confirm DNS has propagated before continuing — Caddy's certificate request will
fail if the name doesn't resolve yet:

```bash
dig +short your-name.duckdns.org     # must print <VM_IP>
```

## 5. Upload the source

From Windows, in this directory:

```powershell
.\ship.ps1 -VmIp <VM_IP> -KeyPath ~\.ssh\your_key
```

This packs `web/` (excluding `node_modules`, build output, local databases and
`.env`) and unpacks it to `~/pharmalink` on the VM. Your local `.env` is
deliberately **not** shipped — the server gets its own secrets.

> Prefer git? `git init` the `web/` directory, push to a **private** GitHub repo
> and `git clone` on the VM instead. Check `git status` before the first commit:
> `.env` holds a live Google OAuth client secret and an ngrok token. The
> `.gitignore` already excludes it — verify rather than assume.

## 6. Configure and launch

SSH in and fill out the environment file:

```bash
ssh -i ~/.ssh/your_key ubuntu@<VM_IP>
cd ~/pharmalink/deploy/oci
cp .env.oci.example .env
openssl rand -base64 32          # copy this into AUTH_SECRET
nano .env
```

Set these four to your real hostname and generated secret:

```ini
SITE_ADDRESS=your-name.duckdns.org
AUTH_URL=https://your-name.duckdns.org
NEXT_PUBLIC_SITE_URL=https://your-name.duckdns.org
AUTH_SECRET=<the value you just generated>
```

Then build and start:

```bash
docker compose -f docker-compose.oci.yml up -d --build
```

The first build takes **8–15 minutes** on the ARM shape — it installs
dependencies, bakes the seeded template database, and compiles the Next.js
production bundle. Watch it with:

```bash
docker compose -f docker-compose.oci.yml logs -f
```

Caddy requests the certificate as soon as the app reports healthy. When you see
`certificate obtained successfully`, open **https://your-name.duckdns.org**.

Demo logins (password `Password123!`): `riya@cipla.test` (buyer),
`suresh@sunpharma.test` (supplier), `ops@pharmalink.global` (admin).

## 7. Optional — enable Google SSO

Google only permits HTTPS redirect URIs for non-localhost origins, so do this
after TLS is working. In Google Cloud Console → Credentials → your OAuth client,
add to **Authorised redirect URIs**:

```
https://your-name.duckdns.org/api/auth/callback/google
```

Then set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in `.env` and restart:

```bash
docker compose -f docker-compose.oci.yml up -d
```

---

## Operating it

```bash
cd ~/pharmalink/deploy/oci

docker compose -f docker-compose.oci.yml ps         # status
docker compose -f docker-compose.oci.yml logs -f app
docker compose -f docker-compose.oci.yml restart app
docker compose -f docker-compose.oci.yml down       # stop, KEEP the data volume
```

### Deploying a code change

Re-run `ship.ps1` from Windows, then on the VM:

```bash
docker compose -f docker-compose.oci.yml up -d --build
```

The `data` volume is untouched by a rebuild, so the database and uploads carry
over. Note that changing `NEXT_PUBLIC_SITE_URL` **requires** `--build` — it is
compiled into the browser bundle, not read at runtime.

### Backups

Everything that matters is in the `pharmalink_data` volume:

```bash
docker run --rm -v pharmalink_data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/pharmalink-backup-$(date +%F).tgz -C /data .
```

Copy the tarball off the VM with `scp`. Restore by extracting it back into the
volume with the app stopped.

### Schema changes on an existing database

The image carries no Prisma CLI at runtime, so run migrations from a throwaway
container that mounts the same volume:

```bash
docker compose -f docker-compose.oci.yml stop app
docker run --rm -v pharmalink_data:/data -v ~/pharmalink:/app -w /app node:20-slim \
  sh -c "npm ci && DATABASE_URL=file:/data/pharmalink.db npx prisma db push"
docker compose -f docker-compose.oci.yml start app
```

For a demo you can simply wipe and reseed instead: `down -v` then `up -d --build`.

---

## Troubleshooting

### Out of capacity when creating the VM

Free ARM cores are heavily oversubscribed, and there are **two distinct errors**
involved. They look similar and need opposite responses, which is why
`provision.py` classifies them separately:

| Error | Meaning | Response |
|---|---|---|
| `500 InternalError` — *"Out of host capacity."* | No free ARM hosts right now | Keep retrying; it clears on its own |
| `429 TooManyRequests` | **You** are asking too fast | Back off hard — retrying faster makes it worse |

Note the capacity error arrives as a **500 `InternalError`**, not a dedicated
capacity code — the only reliable signal is the message text. And OCI
rate-limits `LaunchInstance` per user, so a tight retry loop earns 429s on top
of the capacity problem and never succeeds. `provision.py` backs off
exponentially with jitter, settling at one attempt every 10 minutes.

Options, in order of effectiveness:

1. **Keep retrying.** `python provision.py --retry-minutes 240`. The network is
   created idempotently, so re-running resumes rather than duplicating. This
   usually lands within a day.
2. **Choose a quieter home region.** Set at signup and *cannot* be changed
   later — worth getting right. Single-AD regions (Hyderabad, for instance)
   are worse, because there is no second availability domain to fall back to.
3. **Fall back to the AMD shape** (`VM.Standard.E2.1.Micro`, 1 OCPU / 1 GB) —
   effectively always available, and Always Free allows two. 1 GB cannot
   compile Next.js, but it doesn't have to: that shape is **x86_64**, so build
   the image on your own machine and transfer it instead of building on the VM:

   ```powershell
   docker build -t pharmalink:1 --build-arg NEXT_PUBLIC_SITE_URL=https://your-host .
   docker save pharmalink:1 | gzip > pharmalink.tgz
   scp -i <key> pharmalink.tgz ubuntu@<ip>:~/
   ssh -i <key> ubuntu@<ip> "gunzip -c pharmalink.tgz | docker load"
   ```

   `bootstrap.sh` still adds a 4 GB swapfile, which keeps the runtime
   comfortable on 1 GB.

### The site is unreachable but the containers are running

Almost always the security list (step 2, layer 1). Check from the VM first:

```bash
curl -I http://localhost                      # works? then the app is fine
curl -I http://<VM_IP>                        # fails from outside? firewall
sudo iptables -L INPUT -n --line-numbers      # is tcp/80 ACCEPT present?
```

If `localhost` works and the public IP doesn't, the ingress rules are missing or
were added to the wrong subnet's security list.

### Caddy can't get a certificate

```bash
docker compose -f docker-compose.oci.yml logs caddy
```

- `no such host` / NXDOMAIN → DNS hasn't propagated; recheck `dig +short`.
- `timeout during connect` → port 80 is not reachable from the internet.
  Let's Encrypt validates over HTTP; both firewall layers must allow tcp/80.
- Rate-limited → you have retried too often. Caddy backs off automatically;
  don't destroy the `caddy_data` volume, which caches the certificate and ACME
  account.

### Redirect loops or broken links after login

`AUTH_URL` and `NEXT_PUBLIC_SITE_URL` must both be the full public origin
**including `https://`**, and must match `SITE_ADDRESS`. If you changed
`NEXT_PUBLIC_SITE_URL` without `--build`, the old value is still baked into the
client bundle.

### Build gets OOM-killed

Only on the 1 GB AMD shape. Confirm swap is active with `free -h`; if the
swapfile is missing, re-run `bootstrap.sh`.

---

## Security notes before you share the link

This puts a demo app on the public internet with **well-known credentials**.
Two things carried over from the security review that matter more once it's
publicly reachable:

- **There is no login rate limiting or account lockout.** The demo accounts and
  their shared password are documented, so treat this as a demo, not a system
  holding anything sensitive.
- **API keys are not gated by plan entitlement** — any signed-up org can mint
  one. Deliberate, so the demo works; worth knowing if the URL circulates.

Generate a **fresh `AUTH_SECRET`** on the VM rather than reusing the local dev
value, and keep `.env` off git.
