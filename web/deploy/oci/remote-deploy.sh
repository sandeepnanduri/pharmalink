#!/usr/bin/env bash
# Runs ON THE VM. Pulls the image the CI job just built, restarts the stack,
# and puts the previous image back if the new one does not come up.
#
#   printf '%s' "$TOKEN" | ssh vm "NEW_IMAGE=... ACTOR=... bash remote-deploy.sh"
#
# The registry token arrives on stdin rather than as an argument or an
# environment variable: arguments are visible in the VM's process list, and a
# variable would linger in the shell's environment for the life of the session.
# It is a job-scoped GitHub token, so it expires when the workflow run ends and
# nothing long-lived is left behind either way.
#
# Lives in the repository rather than inline in the workflow so it can be read,
# diffed and run by hand when a deploy needs debugging:
#
#   NEW_IMAGE=ghcr.io/owner/pharmalink:abc123 ACTOR=you bash remote-deploy.sh
set -euo pipefail

: "${NEW_IMAGE:?NEW_IMAGE is required}"
: "${ACTOR:?ACTOR is required}"

cd "$(dirname "$0")"
COMPOSE=(docker compose -f docker-compose.prebuilt.yml)

# Read the token without echoing it. Empty is allowed: a public package pulls
# anonymously, and requiring a login would break that case for no benefit.
IFS= read -r TOKEN || true

current_image() {
  local cid
  cid="$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)"
  [ -n "$cid" ] || return 0
  docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true
}

# What is serving right now, so a failed deploy has somewhere to go back to.
# Empty on the very first deploy, which is handled at the rollback below.
PREV="$(current_image)"
echo "currently running: ${PREV:-<nothing>}"
echo "deploying:         $NEW_IMAGE"

if [ -n "$TOKEN" ]; then
  printf '%s' "$TOKEN" | docker login ghcr.io -u "$ACTOR" --password-stdin
fi

export APP_IMAGE="$NEW_IMAGE"
"${COMPOSE[@]}" pull app
"${COMPOSE[@]}" up -d

# Read the container's own healthcheck rather than probing a port: the compose
# file only *exposes* 3000 to the Caddy service, so there is nothing on the host
# to curl, and this is the same signal the restart policy acts on. It allows 90s
# of start_period on a 1 GB shape, so wait well past that — four minutes.
healthy() {
  local cid status
  for _ in $(seq 1 48); do
    cid="$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
      case "$status" in
        healthy) return 0 ;;
        unhealthy) echo "container reports unhealthy"; return 1 ;;
      esac
    fi
    sleep 5
  done
  echo "timed out waiting for the container to report healthy"
  return 1
}

cleanup() { docker logout ghcr.io >/dev/null 2>&1 || true; }
trap cleanup EXIT

if healthy; then
  echo "healthy on $NEW_IMAGE"

  # Record which image is live, so a later `docker compose up -d` run by hand
  # brings up THIS one. Without it the .env value wins and the stack silently
  # reverts to whatever was pinned there before -- a rollback nobody asked for,
  # triggered by a command that looks like a no-op.
  #
  # This is the one line of .env the deploy owns. Secrets in that file are
  # never read or written here.
  if [ -f .env ] && grep -q '^APP_IMAGE=' .env; then
    sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$NEW_IMAGE|" .env
  else
    echo "APP_IMAGE=$NEW_IMAGE" >> .env
  fi

  # Keep recent images so a rollback has something to roll back to; drop the
  # rest, because a 50 GB boot volume fills quickly at one image per push.
  docker image prune -af --filter 'until=168h' >/dev/null 2>&1 || true
  exit 0
fi

echo "new image did not become healthy — last 60 lines:"
"${COMPOSE[@]}" logs --tail 60 app || true

if [ -n "$PREV" ] && [ "$PREV" != "$NEW_IMAGE" ]; then
  echo "rolling back to $PREV"
  APP_IMAGE="$PREV" "${COMPOSE[@]}" up -d
  if healthy; then
    echo "rolled back and healthy on $PREV"
  else
    echo "ROLLBACK ALSO UNHEALTHY — the site is down and needs a human"
  fi
else
  echo "no previous image to roll back to"
fi
exit 1
