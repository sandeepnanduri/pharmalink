#!/usr/bin/env bash
# Prepare a fresh Oracle Cloud "Always Free" VM to run PharmaLink.
#
#   curl -fsSL -o bootstrap.sh <this file>   # or scp it up
#   chmod +x bootstrap.sh && ./bootstrap.sh
#
# Installs Docker Engine + the Compose plugin, then opens ports 80/443 in the
# instance's LOCAL firewall. Safe to re-run.
#
# IMPORTANT: this only opens the firewall *inside* the VM. You must ALSO add
# ingress rules to the subnet's Security List in the OCI console — traffic is
# dropped by the virtual network before it ever reaches this machine otherwise.
# That two-layer firewall is the single most common reason an OCI deploy is
# unreachable. See README.md step 2.
set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  warn "Running as root. The 'docker' group step is meant for your normal login user."
fi

# --- 1. Docker ------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  log "Docker already installed: $(docker --version)"
else
  log "Installing Docker Engine"
  # get.docker.com handles Ubuntu and Oracle Linux, x86_64 and aarch64.
  curl -fsSL https://get.docker.com | sudo sh
fi

if ! docker compose version >/dev/null 2>&1; then
  warn "The 'docker compose' plugin is missing; installing the distro package."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y docker-compose-plugin
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y docker-compose-plugin
  fi
fi

log "Enabling Docker at boot"
sudo systemctl enable --now docker

if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  log "Adding $USER to the docker group"
  sudo usermod -aG docker "$USER"
  NEEDS_RELOGIN=1
fi

# --- 2. Local firewall ----------------------------------------------------
# OCI's stock images ship a restrictive firewall that allows little beyond SSH.
# Ubuntu images use iptables + netfilter-persistent; Oracle Linux uses firewalld.
log "Opening ports 80 and 443 in the local firewall"

if command -v firewall-cmd >/dev/null 2>&1 && sudo systemctl is-active --quiet firewalld; then
  echo "  firewalld detected"
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
elif command -v iptables >/dev/null 2>&1; then
  echo "  iptables detected"
  for port in 80 443; do
    # -C tests for an existing rule so re-runs don't stack duplicates.
    if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
      # Insert ABOVE the catch-all REJECT that OCI images place at the end of INPUT.
      sudo iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
      echo "  opened tcp/$port"
    else
      echo "  tcp/$port already open"
    fi
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then
    sudo netfilter-persistent save
  else
    warn "netfilter-persistent not found — iptables rules will NOT survive a reboot."
    warn "Install it with: sudo apt-get install -y iptables-persistent"
  fi
else
  warn "No recognised firewall tool found; skipping. Verify manually."
fi

# --- 3. Swap (small shapes only) -----------------------------------------
# `next build` is memory-hungry. The Ampere A1 shape (12 GB) is fine, but the
# AMD E2.1.Micro fallback has 1 GB and will OOM mid-build without swap.
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
log "Detected ${MEM_MB} MB RAM"
if [ "$MEM_MB" -lt 4096 ] && [ ! -f /swapfile ]; then
  log "Creating a 4 GB swapfile so the Next.js build doesn't get OOM-killed"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

log "Bootstrap complete"
docker --version
docker compose version || true
echo
echo "Next: upload the app source, then see deploy/oci/README.md step 4."
if [ -n "${NEEDS_RELOGIN:-}" ]; then
  echo
  warn "Log out and back in (or run 'newgrp docker') before using docker without sudo."
fi
