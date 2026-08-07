# -----------------------------------------------------------------------------
# PharmaLink -> Azure Container Apps (single self-contained container).
#
# YOU run this — it is intentionally NOT executed for you, and it deploys into a
# DEDICATED resource group (default: rg-pharmalink-demo), never the Standex CapEx
# dev environment. Review the variables, then run:  ./azure-deploy.ps1
#
# Prereqs: az CLI logged in (az login), Docker NOT required (build runs in ACR).
# -----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

# --- Edit these -------------------------------------------------------------
$RG       = 'rg-pharmalink-demo'          # dedicated RG (NOT a CapEx/dev RG)
$LOCATION = 'centralus'
$ACR      = "acrpharmalink$((Get-Random -Maximum 99999))"  # must be globally unique
$ENV_NAME = 'cae-pharmalink'
$APP      = 'ca-pharmalink'
$IMAGE    = 'pharmalink/app:1'
$SA       = "stpharmalink$((Get-Random -Maximum 99999))"   # storage acct (3-24 lc)
$SHARE    = 'data'
$SEED     = 'true'                          # bake demo data into the image
# NEXT_PUBLIC_SITE_URL is baked at build time; set after first deploy if unknown.
$SITE_URL = 'http://localhost:3000'
# ---------------------------------------------------------------------------

Write-Host "Target subscription:" (az account show --query name -o tsv)
Write-Host "Resource group     : $RG (will be created if missing)`n"

# 1. Resource group + ACR
az group create -n $RG -l $LOCATION | Out-Null
az acr create -n $ACR -g $RG --sku Basic --admin-enabled true | Out-Null

# 2. Build the single-container image in ACR (no local Docker needed)
az acr build -r $ACR -t $IMAGE `
  --build-arg NEXT_PUBLIC_SITE_URL=$SITE_URL `
  --build-arg SEED=$SEED .

# 3. Container Apps environment
az containerapp env create -g $RG -n $ENV_NAME -l $LOCATION | Out-Null

# 4. Persistent storage for /data (SQLite db + uploaded documents)
az storage account create -n $SA -g $RG -l $LOCATION --sku Standard_LRS | Out-Null
$KEY = az storage account keys list -n $SA -g $RG --query '[0].value' -o tsv
az storage share create -n $SHARE --account-name $SA --account-key $KEY | Out-Null
az containerapp env storage set -g $RG -n $ENV_NAME `
  --storage-name $SHARE --azure-file-account-name $SA `
  --azure-file-account-key $KEY --azure-file-share-name $SHARE --access-mode ReadWrite | Out-Null

# 5. Create the container app (single replica — SQLite has one writer)
$LOGIN = az acr show -n $ACR --query loginServer -o tsv
$AUTH_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
az containerapp create -g $RG -n $APP `
  --environment $ENV_NAME `
  --image "$LOGIN/$IMAGE" `
  --registry-server $LOGIN `
  --target-port 3000 --ingress external `
  --min-replicas 1 --max-replicas 1 `
  --secrets "auth-secret=$AUTH_SECRET" `
  --env-vars AUTH_SECRET=secretref:auth-secret AUTH_TRUST_HOST=true NEXT_PUBLIC_SITE_URL=$SITE_URL | Out-Null

# 6. Attach the /data volume (the one thing the create CLI can't do inline)
$tmp = New-TemporaryFile
az containerapp show -g $RG -n $APP -o yaml | Out-File -Encoding utf8 $tmp
Write-Host "`nEdit $tmp: under properties.template add a 'volumes' entry (name: data," `
  "storageType: AzureFile, storageName: $SHARE) and a containers[0].volumeMounts" `
  "entry (volumeName: data, mountPath: /data), then run:`n" `
  "  az containerapp update -g $RG -n $APP --yaml $tmp`n"

$FQDN = az containerapp show -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv
Write-Host "App URL: https://$FQDN"
Write-Host "If the baked NEXT_PUBLIC_SITE_URL was localhost, rebuild step 2 with"
Write-Host "  --build-arg NEXT_PUBLIC_SITE_URL=https://$FQDN  and re-run 'az containerapp update --image ...'."
