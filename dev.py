#!/usr/bin/env python3
"""Dev environment control.

Usage:
  python dev.py                    # backend + frontend (both detached)
  python dev.py -e                 # with ENTERPRISE_MODE=true
  python dev.py --attach frontend  # both, terminal attached to frontend
  python dev.py --attach backend   # both, terminal attached to backend
  python dev.py --down             # bring down all services
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent
COMPOSE_FILE = ROOT / "docker-compose.dev.yml"


def run_compose(args: list, env: Optional[dict] = None, detach: bool = False) -> int:
    cmd = ["docker", "compose", "-f", str(COMPOSE_FILE)] + args
    if detach:
        cmd.append("-d")
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=ROOT, env=env or os.environ).returncode


def main():
    parser = argparse.ArgumentParser(
        description="Dev environment control",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "-e",
        "--enterprise",
        action="store_true",
        help="Set ENTERPRISE_MODE=True (backend) and NEXT_PUBLIC_ENTERPRISE_MODE=true (frontend)",
    )
    parser.add_argument(
        "--attach",
        choices=["frontend", "backend"],
        metavar="SERVICE",
        help="Start all, attach terminal to frontend or backend",
    )
    parser.add_argument(
        "--down",
        action="store_true",
        help="Bring down all services",
    )
    parser.add_argument(
        "--build",
        action="store_true",
        help="Build images before starting",
    )
    args = parser.parse_args()

    env = os.environ.copy()
    if args.enterprise:
        env["ENTERPRISE_MODE"] = "True"  # backend
        env["NEXT_PUBLIC_ENTERPRISE_MODE"] = "true"  # frontend
        print("(ENTERPRISE_MODE=True, NEXT_PUBLIC_ENTERPRISE_MODE=true)")

    if args.down:
        sys.exit(run_compose(["down"], env=env))

    compose_args = ["up"]
    if args.build:
        compose_args.append("--build")

    if args.attach:
        # Ensure all are up
        rc = run_compose(compose_args + ["-d"], env=env)
        if rc != 0:
            sys.exit(rc)
        # Attach to the requested service(s)
        services = ["frontend"] if args.attach == "frontend" else ["api", "worker"]
        sys.exit(run_compose(compose_args + services, env=env))

    # Default: both detached
    sys.exit(run_compose(compose_args, env=env, detach=True))


if __name__ == "__main__":
    main()
