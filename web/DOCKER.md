# Running PharmaLink as a single container

The whole app ships as **one self-contained image**: the Next.js standalone
server plus an embedded **SQLite** database. The database file and uploaded
documents live under `/data`, which you back with a volume so they persist.

- **No separate database service.** Schema + demo data are baked into a template
  DB at build time; on first boot the container copies it onto the `/data`
  volume, then reuses it on every later boot (your data is preserved).
- The committed Prisma schema stays on SQLite, so `npm run dev` and the test
  suite are unchanged.

---

## 1. Local — Docker Compose

```bash
cp .env.docker.example .env          # then set AUTH_SECRET
docker compose up --build            # build & run; seeds demo data on first boot
```

Open http://localhost:3000. Demo logins (password `Password123!`): `riya@cipla.test`
(buyer), `suresh@sunpharma.test` (supplier), `ops@pharmalink.global` (admin).

```bash
docker compose down                  # stop, keep the /data volume
docker compose down -v               # stop and wipe db + uploads
```

Or without Compose:

```bash
docker build -t pharmalink:1 --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000 .
docker run -p 3000:3000 -v pharmalink-data:/data \
  -e AUTH_SECRET="$(openssl rand -base64 32)" -e AUTH_TRUST_HOST=true \
  pharmalink:1
```

Build an **empty** (no demo data) image with `--build-arg SEED=false`.

---

## 2. Azure Container Apps — one container app

### 2.1 Build & push the image (in ACR, no local Docker needed)

```bash
RG=pharmalink-rg; LOC=eastus; ACR=pharmalinkacr$RANDOM
az group create -n $RG -l $LOC
az acr create -n $ACR -g $RG --sku Basic --admin-enabled true

az acr build -r $ACR -t pharmalink/app:1 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://<your-app-fqdn> \
  --build-arg SEED=true .
```

> `NEXT_PUBLIC_SITE_URL` is baked into the client bundle — rebuild if the public
> URL changes. You can deploy first with the localhost default, note the assigned
> FQDN, then rebuild with it.

### 2.2 Persistent storage for `/data` (required)

A container app's own filesystem is ephemeral, so mount **Azure Files** at `/data`
to keep the SQLite database and uploads across restarts/deploys:

```bash
# storage account + file share
az storage account create -n pharmalinksa -g $RG -l $LOC --sku Standard_LRS
KEY=$(az storage account keys list -n pharmalinksa -g $RG --query '[0].value' -o tsv)
az storage share create -n data --account-name pharmalinksa --account-key "$KEY"

# register the share with the Container Apps environment
az containerapp env create -g $RG -n pharmalink-env -l $LOC
az containerapp env storage set -g $RG -n pharmalink-env \
  --storage-name data --azure-file-account-name pharmalinksa \
  --azure-file-account-key "$KEY" --azure-file-share-name data --access-mode ReadWrite
```

### 2.3 Create the container app (single replica)

SQLite has a single writer, so keep it to **one replica**:

```bash
az containerapp create -g $RG -n pharmalink-app \
  --environment pharmalink-env \
  --image $ACR.azurecr.io/pharmalink/app:1 \
  --registry-server $ACR.azurecr.io \
  --target-port 3000 --ingress external \
  --min-replicas 1 --max-replicas 1 \
  --secrets auth-secret="$(openssl rand -base64 32)" \
  --env-vars \
    AUTH_SECRET=secretref:auth-secret \
    AUTH_TRUST_HOST=true \
    NEXT_PUBLIC_SITE_URL=https://<your-app-fqdn>
```

Then attach the volume (mount the `data` storage at `/data`) via YAML — the one
setting the CLI can't do inline:

```bash
az containerapp show -g $RG -n pharmalink-app -o yaml > app.yaml
# under properties.template, add:
#   volumes:
#     - name: data
#       storageType: AzureFile
#       storageName: data
#   containers[0].volumeMounts:
#     - volumeName: data
#       mountPath: /data
az containerapp update -g $RG -n pharmalink-app --yaml app.yaml
```

Point the health probe at `GET /api/health` (200 only when the DB is reachable).

---

## 3. Oracle Cloud "Always Free" VM — see [`deploy/oci/README.md`](deploy/oci/README.md)

A zero-cost, no-expiry alternative to Container Apps. Because it's a real VM
with a real block volume, `/data` is genuinely persistent — no Azure Files, no
SMB locking caveat, and no cold starts.

```bash
# on the VM, after deploy/oci/bootstrap.sh
cd ~/pharmalink/deploy/oci
cp .env.oci.example .env && nano .env
docker compose -f docker-compose.oci.yml up -d --build
```

That stack adds a **Caddy** reverse proxy in front of the app which obtains and
renews a Let's Encrypt certificate automatically, so the deployment is HTTPS
without a manual cert step. The walkthrough covers the two-layer OCI firewall
(security list *and* in-VM iptables), free DNS via DuckDNS, backups, and the
ARM capacity workaround.

The app image itself is unchanged — same `Dockerfile`, same single container.

---

## Scaling & durability notes

- **One writer.** SQLite means a single replica. This suits an MVP / internal
  tool. To scale horizontally (or for heavy write load), move to PostgreSQL:
  the schema is Postgres-portable — set `provider = "postgresql"`, point
  `DATABASE_URL` at a managed Postgres, and run `prisma db push`. (Earlier git
  history / this repo can carry a Postgres compose variant if you want it back.)
- **SQLite on Azure Files (SMB)** works for low write volume but SMB file
  locking is weaker than a local disk. For anything write-heavy or
  business-critical, prefer PostgreSQL.
- **Schema changes** to an existing `/data` database: redeploy onto a fresh
  volume (demo), or run a one-off `prisma db push` via
  `az containerapp exec` against the mounted DB.

---

## Required environment variables

| Var | When | Notes |
|-----|------|-------|
| `AUTH_SECRET` | runtime | **required**; `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | runtime | `true` behind the Container Apps ingress |
| `NEXT_PUBLIC_SITE_URL` | **build** + runtime | baked into the client bundle; must equal the public URL |
| `SEED` | build arg | `true` bakes demo data into the image |
| `AUTH_GOOGLE_ID/SECRET`, `BOXYHQ_SAML_*` | runtime | optional SSO |
| `DATABASE_URL`, `UPLOAD_DIR` | fixed in image | `/data/*`; made durable by the volume |
