"""
Provision the OCI infrastructure PharmaLink needs, using the OCI Python SDK.

Creates (or reuses, if it already exists) a VCN with internet connectivity, a
public subnet whose security list allows 22/80/443, and an Always-Free Ampere
A1 instance running Ubuntu 24.04.

Every step is idempotent and matched by display name, so re-running after a
failure resumes rather than duplicating. The Ampere shape is heavily
oversubscribed on the free tier, so instance launch retries on capacity errors
instead of giving up.

    python provision.py                 # provision, retrying capacity for ~30 min
    python provision.py --retry-minutes 120
    python provision.py --show           # print current state, change nothing
    python provision.py --destroy        # tear the instance down

Reads credentials from ~/.oci/config [DEFAULT].
"""

from __future__ import annotations

import argparse
import random
import subprocess
import sys
import time
from pathlib import Path

import oci

# --- names: stable, so every run finds what the last one made -------------
PREFIX = "pharmalink"
VCN_NAME = f"{PREFIX}-vcn"
IG_NAME = f"{PREFIX}-ig"
SUBNET_NAME = f"{PREFIX}-subnet"
INSTANCE_NAME = PREFIX
VCN_CIDR = "10.0.0.0/16"
SUBNET_CIDR = "10.0.1.0/24"

# Both Always Free shapes. Ampere is the better machine by far, but its free
# capacity is heavily oversubscribed; the AMD micro is effectively always
# available and makes a usable fallback, so long as you don't try to *build* on
# it — 1 GB will not compile Next.js. Build elsewhere and transfer the image
# (see README "Out of capacity").
SHAPES = {
    "arm": {
        "shape": "VM.Standard.A1.Flex",
        "ocpus": 2,
        "memory_gb": 12,
        "is_flex": True,       # flexible shapes take an explicit shape_config
        "arch": "aarch64",
        "instance_name": PREFIX,
    },
    "amd": {
        "shape": "VM.Standard.E2.1.Micro",
        "ocpus": 1,
        "memory_gb": 1,
        "is_flex": False,      # fixed shape — passing shape_config is rejected
        "arch": "x86_64",
        "instance_name": f"{PREFIX}-amd",
    },
}

# Set by select_shape(); defaults to ARM.
SHAPE = SHAPES["arm"]["shape"]
OCPUS = SHAPES["arm"]["ocpus"]
MEMORY_GB = SHAPES["arm"]["memory_gb"]
IS_FLEX = SHAPES["arm"]["is_flex"]
ARCH = SHAPES["arm"]["arch"]
BOOT_VOLUME_GB = 50


def select_shape(kind: str) -> None:
    """Point the module's shape constants at one of the Always Free shapes.

    The two shapes coexist deliberately: each gets its own instance name, so an
    AMD fallback can run while the ARM capacity hunt continues in parallel
    without the two runs mistaking each other's instance for their own.
    """
    global SHAPE, OCPUS, MEMORY_GB, IS_FLEX, ARCH, INSTANCE_NAME
    spec = SHAPES[kind]
    SHAPE = spec["shape"]
    OCPUS = spec["ocpus"]
    MEMORY_GB = spec["memory_gb"]
    IS_FLEX = spec["is_flex"]
    ARCH = spec["arch"]
    INSTANCE_NAME = spec["instance_name"]

SSH_KEY_PATH = Path.home() / ".ssh" / "oci_pharmalink"

# Retry pacing for the capacity hunt. LaunchInstance is rate-limited per user,
# so these are deliberately unhurried — a faster loop just collects 429s.
BACKOFF_START_S = 90
BACKOFF_MAX_S = 600

# --------------------------------------------------------------------------
# Always Free envelope — every limit this script must stay inside.
#
# Source: docs.oracle.com "Always Free Resources". These are asserted at
# runtime rather than merely documented, so a careless edit to the constants
# above fails loudly instead of quietly provisioning something billable.
# --------------------------------------------------------------------------
FREE_TIER = {
    # shape -> (max ocpus, max memory GB) across ALL instances of that shape
    "VM.Standard.A1.Flex": (2, 12),
    "VM.Standard.E2.1.Micro": (2, 2),  # 2 instances x 1/8 OCPU, 1 GB each
}
FREE_BLOCK_STORAGE_GB = 200   # boot + block volumes combined
FREE_MIN_BOOT_GB = 47
FREE_VCNS = 2
FREE_INTERNET_GATEWAYS = 1


def assert_within_free_tier() -> list[str]:
    """Refuse to run if the requested resources could incur charges.

    Returns the human-readable plan so the caller can show it before acting.
    """
    if SHAPE not in FREE_TIER:
        raise SystemExit(
            f"REFUSING: shape {SHAPE} is not an Always Free shape.\n"
            f"Always Free shapes are: {', '.join(FREE_TIER)}"
        )

    max_ocpu, max_mem = FREE_TIER[SHAPE]
    if OCPUS > max_ocpu:
        raise SystemExit(
            f"REFUSING: {OCPUS} OCPUs exceeds the Always Free limit of "
            f"{max_ocpu} for {SHAPE}. This would be billed."
        )
    if MEMORY_GB > max_mem:
        raise SystemExit(
            f"REFUSING: {MEMORY_GB} GB memory exceeds the Always Free limit of "
            f"{max_mem} GB for {SHAPE}. This would be billed."
        )
    if BOOT_VOLUME_GB > FREE_BLOCK_STORAGE_GB:
        raise SystemExit(
            f"REFUSING: {BOOT_VOLUME_GB} GB boot volume exceeds the "
            f"{FREE_BLOCK_STORAGE_GB} GB Always Free storage allowance."
        )
    if BOOT_VOLUME_GB < FREE_MIN_BOOT_GB:
        raise SystemExit(
            f"REFUSING: boot volume must be at least {FREE_MIN_BOOT_GB} GB."
        )

    return [
        f"compute          {SHAPE}  {OCPUS} OCPU / {MEMORY_GB} GB"
        f"   (free limit: {max_ocpu} / {max_mem})",
        f"boot volume      {BOOT_VOLUME_GB} GB"
        f"                        (free limit: {FREE_BLOCK_STORAGE_GB} GB total)",
        f"public IPv4      1 ephemeral                          (free, not metered by OCI)",
        f"VCN              1                                    (free limit: {FREE_VCNS})",
        f"internet gateway 1                                    (free limit: {FREE_INTERNET_GATEWAYS})",
        f"egress           10 TB/month included                 (a demo uses ~0)",
        "",
        "NOT created (each of these is billable or unnecessary):",
        "  load balancer, NAT gateway, reserved public IP, block volume backups,",
        "  object storage, autonomous database, monitoring beyond defaults.",
    ]


def assert_tenancy_capacity(compute, net, compartment: str) -> None:
    """Check the tenancy has free-tier headroom BEFORE launching.

    Always Free counts OCPUs across every A1 instance in the tenancy, so an
    instance left over from an earlier attempt silently eats the allowance.
    """
    used_ocpu = 0.0
    for i in oci.pagination.list_call_get_all_results(
        compute.list_instances, compartment_id=compartment
    ).data:
        if i.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        if i.shape != SHAPE:
            continue
        if i.display_name == INSTANCE_NAME:
            continue  # our own instance; reused, not duplicated
        used_ocpu += getattr(i.shape_config, "ocpus", 0) or 0

    max_ocpu = FREE_TIER[SHAPE][0]
    if used_ocpu + OCPUS > max_ocpu:
        raise SystemExit(
            f"REFUSING: other {SHAPE} instances already use {used_ocpu} of "
            f"{max_ocpu} free OCPUs.\nLaunching {OCPUS} more would exceed the "
            "Always Free allowance and be billed.\n"
            "Terminate the unused instance in Compute > Instances first."
        )
    if used_ocpu:
        log(f"other A1 instances use {used_ocpu} OCPU; {max_ocpu - used_ocpu} free")


def log(msg: str) -> None:
    print(f"==> {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[warn] {msg}", flush=True)


# --------------------------------------------------------------------------
# SSH key
# --------------------------------------------------------------------------
def ensure_ssh_key() -> str:
    """Generate an SSH keypair for the instance if we don't have one yet."""
    pub = SSH_KEY_PATH.with_suffix(".pub")
    if pub.exists():
        log(f"reusing SSH key {SSH_KEY_PATH}")
        return pub.read_text().strip()

    SSH_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    log(f"generating SSH keypair at {SSH_KEY_PATH}")
    subprocess.run(
        ["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "pharmalink-oci",
         "-f", str(SSH_KEY_PATH)],
        check=True,
    )
    # Windows refuses to use a key other accounts can read.
    if sys.platform == "win32":
        subprocess.run(
            ["icacls", str(SSH_KEY_PATH), "/inheritance:r",
             "/grant:r", f"{Path.home().name}:(R)"],
            check=False, capture_output=True,
        )
    return pub.read_text().strip()


# --------------------------------------------------------------------------
# Networking — each helper returns an existing resource or creates one
# --------------------------------------------------------------------------
def ensure_vcn(net, compartment: str):
    for v in oci.pagination.list_call_get_all_results(
        net.list_vcns, compartment_id=compartment
    ).data:
        if v.display_name == VCN_NAME and v.lifecycle_state == "AVAILABLE":
            log(f"VCN exists: {v.display_name}")
            return v

    log(f"creating VCN {VCN_NAME} ({VCN_CIDR})")
    vcn = net.create_vcn(
        oci.core.models.CreateVcnDetails(
            compartment_id=compartment,
            cidr_block=VCN_CIDR,
            display_name=VCN_NAME,
            dns_label=PREFIX[:15],
        )
    ).data
    return oci.wait_until(
        net, net.get_vcn(vcn.id), "lifecycle_state", "AVAILABLE"
    ).data


def ensure_internet_gateway(net, compartment: str, vcn_id: str):
    for g in net.list_internet_gateways(
        compartment_id=compartment, vcn_id=vcn_id
    ).data:
        if g.display_name == IG_NAME:
            log("internet gateway exists")
            return g

    log("creating internet gateway")
    ig = net.create_internet_gateway(
        oci.core.models.CreateInternetGatewayDetails(
            compartment_id=compartment, vcn_id=vcn_id,
            display_name=IG_NAME, is_enabled=True,
        )
    ).data
    return oci.wait_until(
        net, net.get_internet_gateway(ig.id), "lifecycle_state", "AVAILABLE"
    ).data


def ensure_default_route(net, vcn, ig_id: str) -> None:
    """Point the VCN's default route table at the internet gateway."""
    rt = net.get_route_table(vcn.default_route_table_id).data
    if any(r.network_entity_id == ig_id for r in rt.route_rules):
        log("default route to internet gateway exists")
        return

    log("adding 0.0.0.0/0 route to internet gateway")
    net.update_route_table(
        rt.id,
        oci.core.models.UpdateRouteTableDetails(
            route_rules=list(rt.route_rules) + [
                oci.core.models.RouteRule(
                    destination="0.0.0.0/0",
                    destination_type="CIDR_BLOCK",
                    network_entity_id=ig_id,
                )
            ]
        ),
    )


def ensure_security_rules(net, vcn) -> None:
    """Open 22, 80 and 443 on the VCN's default security list.

    This is only OCI's *outer* firewall. The instance also runs iptables, which
    deploy/oci/bootstrap.sh opens separately — both layers must allow traffic.
    """
    sl = net.get_security_list(vcn.default_security_list_id).data
    wanted = [22, 80, 443]

    def has_port(port: int) -> bool:
        for r in sl.ingress_security_rules:
            if r.protocol != "6" or not r.tcp_options:  # 6 = TCP
                continue
            dst = r.tcp_options.destination_port_range
            if dst and dst.min <= port <= dst.max:
                return True
        return False

    missing = [p for p in wanted if not has_port(p)]
    if not missing:
        log(f"security list already allows {wanted}")
        return

    log(f"opening ports {missing} on the security list")
    rules = list(sl.ingress_security_rules)
    for port in missing:
        rules.append(
            oci.core.models.IngressSecurityRule(
                protocol="6",
                source="0.0.0.0/0",
                source_type="CIDR_BLOCK",
                is_stateless=False,
                tcp_options=oci.core.models.TcpOptions(
                    destination_port_range=oci.core.models.PortRange(
                        min=port, max=port
                    )
                ),
            )
        )
    net.update_security_list(
        sl.id, oci.core.models.UpdateSecurityListDetails(
            ingress_security_rules=rules
        )
    )


def ensure_subnet(net, compartment: str, vcn):
    for s in net.list_subnets(
        compartment_id=compartment, vcn_id=vcn.id
    ).data:
        if s.display_name == SUBNET_NAME and s.lifecycle_state == "AVAILABLE":
            log(f"subnet exists: {s.display_name}")
            return s

    log(f"creating public subnet {SUBNET_NAME} ({SUBNET_CIDR})")
    sn = net.create_subnet(
        oci.core.models.CreateSubnetDetails(
            compartment_id=compartment,
            vcn_id=vcn.id,
            cidr_block=SUBNET_CIDR,
            display_name=SUBNET_NAME,
            dns_label="plsub",
            route_table_id=vcn.default_route_table_id,
            security_list_ids=[vcn.default_security_list_id],
            prohibit_public_ip_on_vnic=False,
        )
    ).data
    return oci.wait_until(
        net, net.get_subnet(sn.id), "lifecycle_state", "AVAILABLE"
    ).data


# --------------------------------------------------------------------------
# Compute
# --------------------------------------------------------------------------
def find_ubuntu_image(compute, compartment: str) -> str:
    images = compute.list_images(
        compartment_id=compartment,
        operating_system="Canonical Ubuntu",
        operating_system_version="24.04",
        shape=SHAPE,
        sort_by="TIMECREATED",
        sort_order="DESC",
    ).data
    if not images:
        raise SystemExit(f"no Ubuntu 24.04 image available for {SHAPE}")

    # OCI names ARM images "...-aarch64-..." and leaves x86 ones unmarked, so
    # select positively for ARM and negatively for x86 rather than assuming.
    if ARCH == "aarch64":
        matching = [i for i in images if "aarch64" in i.display_name]
    else:
        matching = [i for i in images if "aarch64" not in i.display_name]

    chosen = (matching or images)[0]
    log(f"image: {chosen.display_name}")
    return chosen.id


def find_existing_instance(compute, compartment: str):
    for i in oci.pagination.list_call_get_all_results(
        compute.list_instances, compartment_id=compartment
    ).data:
        if i.display_name == INSTANCE_NAME and i.lifecycle_state in (
            "RUNNING", "STARTING", "PROVISIONING", "STOPPED"
        ):
            return i
    return None


def public_ip_of(compute, net, compartment: str, instance_id: str) -> str | None:
    vnics = compute.list_vnic_attachments(
        compartment_id=compartment, instance_id=instance_id
    ).data
    for va in vnics:
        if va.lifecycle_state != "ATTACHED":
            continue
        vnic = net.get_vnic(va.vnic_id).data
        if vnic.public_ip:
            return vnic.public_ip
    return None


def launch_with_retry(compute, compartment: str, ads, subnet_id: str,
                      image_id: str, ssh_key: str, retry_minutes: int,
                      region: str):
    """Launch the instance, cycling ADs and retrying on capacity errors.

    'Out of host capacity' is the normal free-tier experience for Ampere, not a
    misconfiguration — it clears on its own, so we keep asking.
    """
    def details_for(ad):
        kwargs = dict(
            compartment_id=compartment,
            availability_domain=ad,
            display_name=INSTANCE_NAME,
            shape=SHAPE,
            source_details=oci.core.models.InstanceSourceViaImageDetails(
                image_id=image_id, boot_volume_size_in_gbs=BOOT_VOLUME_GB
            ),
            create_vnic_details=oci.core.models.CreateVnicDetails(
                subnet_id=subnet_id, assign_public_ip=True
            ),
            metadata={"ssh_authorized_keys": ssh_key},
        )
        # Fixed shapes (E2.1.Micro) reject shape_config — their CPU and memory
        # are part of the shape definition, not a per-instance choice.
        if IS_FLEX:
            kwargs["shape_config"] = oci.core.models.LaunchInstanceShapeConfigDetails(
                ocpus=OCPUS, memory_in_gbs=MEMORY_GB
            )
        return oci.core.models.LaunchInstanceDetails(**kwargs)

    deadline = time.monotonic() + retry_minutes * 60
    attempt = 0

    # OCI rate-limits LaunchInstance per user, so a tight retry loop earns a
    # 429 on top of the capacity problem and gets us nowhere. Back off
    # exponentially with jitter, and back off harder when actually throttled.
    delay = BACKOFF_START_S

    while True:
        attempt += 1
        throttled = False

        for ad in ads:
            try:
                log(f"attempt {attempt}: launching in {ad}")
                return compute.launch_instance(details_for(ad)).data
            except oci.exceptions.ServiceError as e:
                blob = f"{e.code} {e.message}".lower()

                # Hard limits first — retrying these forever is pointless.
                if "limitexceeded" in blob or "quota" in blob:
                    raise SystemExit(
                        f"\nService limit reached: {e.message}\n"
                        "Always Free allows 2 ARM OCPUs total — you may already "
                        "have an instance using them. Check Compute > Instances."
                    )

                # 429: we are asking too fast. Not a capacity signal at all.
                if e.status == 429 or "toomanyrequests" in blob:
                    warn("throttled by OCI (429) — backing off harder")
                    throttled = True
                    continue

                # Capacity exhaustion is transient, so keep asking. OCI reports
                # it as a 500 InternalError whose message is "Out of host
                # capacity." — matching on the word alone survives the several
                # spellings the API uses across shapes and regions.
                if "capacity" in blob:
                    warn(f"{ad}: no free ARM capacity right now")
                    continue

                raise

        if time.monotonic() >= deadline:
            raise SystemExit(
                f"\nNo ARM capacity in {region} after {retry_minutes} minutes.\n"
                "This is normal for Always Free Ampere in busy regions.\n"
                "  - re-run to keep trying (network already exists, so it resumes)\n"
                "  - or fall back to the AMD shape (see README troubleshooting)"
            )

        # Throttling means slow down a lot; plain capacity means creep up gently.
        delay = min(delay * (3.0 if throttled else 1.5), BACKOFF_MAX_S)
        wait = delay + random.uniform(0, delay * 0.2)  # jitter
        remaining = int(deadline - time.monotonic())
        log(f"waiting {int(wait)}s before retrying ({remaining}s budget left)")
        time.sleep(wait)


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--shape", choices=sorted(SHAPES), default="arm",
                    help="arm = Ampere 2/12 (better, often no capacity); "
                         "amd = E2.1.Micro 1/1 (always available fallback)")
    ap.add_argument("--retry-minutes", type=int, default=30,
                    help="how long to keep retrying capacity errors")
    ap.add_argument("--show", action="store_true",
                    help="report current state and exit")
    ap.add_argument("--destroy", action="store_true",
                    help="terminate the instance (keeps the network)")
    args = ap.parse_args()

    select_shape(args.shape)
    plan = assert_within_free_tier()

    config = oci.config.from_file()
    oci.config.validate_config(config)
    compartment = config["tenancy"]
    region = config["region"]

    identity = oci.identity.IdentityClient(config)
    net = oci.core.VirtualNetworkClient(config)
    compute = oci.core.ComputeClient(config)

    log(f"tenancy verified, region {region}")

    if not (args.show or args.destroy):
        print("\n" + "-" * 68)
        print("  ALWAYS FREE PLAN — nothing below is billable")
        print("-" * 68)
        for line in plan:
            print(f"  {line}")
        print("-" * 68 + "\n")

    if args.destroy:
        inst = find_existing_instance(compute, compartment)
        if not inst:
            log("no instance to destroy")
            return 0
        log(f"terminating {inst.display_name} ({inst.id})")
        compute.terminate_instance(inst.id, preserve_boot_volume=False)
        log("termination requested")
        return 0

    inst = find_existing_instance(compute, compartment)
    if args.show:
        if not inst:
            log("no instance yet")
            return 0
        ip = public_ip_of(compute, net, compartment, inst.id)
        log(f"{inst.display_name}: {inst.lifecycle_state}  ip={ip}")
        return 0

    ads = [a.name for a in identity.list_availability_domains(
        compartment_id=compartment).data]
    log(f"availability domains: {ads}")

    ssh_key = ensure_ssh_key()

    vcn = ensure_vcn(net, compartment)
    ig = ensure_internet_gateway(net, compartment, vcn.id)
    ensure_default_route(net, vcn, ig.id)
    ensure_security_rules(net, vcn)
    subnet = ensure_subnet(net, compartment, vcn)

    if inst:
        log(f"instance already exists ({inst.lifecycle_state})")
    else:
        assert_tenancy_capacity(compute, net, compartment)
        image_id = find_ubuntu_image(compute, compartment)
        inst = launch_with_retry(compute, compartment, ads, subnet.id,
                                 image_id, ssh_key, args.retry_minutes, region)
        log(f"launched {inst.id}")

    log("waiting for RUNNING (this takes a couple of minutes)")
    inst = oci.wait_until(
        compute, compute.get_instance(inst.id),
        "lifecycle_state", "RUNNING", max_wait_seconds=900,
    ).data

    ip = None
    for _ in range(30):
        ip = public_ip_of(compute, net, compartment, inst.id)
        if ip:
            break
        time.sleep(5)

    print("\n" + "=" * 62)
    print(f"  Instance : {inst.display_name}  [{inst.lifecycle_state}]")
    print(f"  Public IP: {ip}")
    print(f"  SSH key  : {SSH_KEY_PATH}")
    print("=" * 62)
    print("\nNext:")
    print(f"  ssh -i {SSH_KEY_PATH} ubuntu@{ip}")
    print(f"  point your DuckDNS subdomain at {ip}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
