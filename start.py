#!/usr/bin/env python3

import subprocess
import sys
import platform

IS_WINDOWS = platform.system() == 'Windows'

def check_docker_compose_up():
    result = subprocess.run(
        ["docker", "compose", "ps", "-q"],
        capture_output=True,
        text=True,
        shell=IS_WINDOWS
    )
    return len(result.stdout.strip()) > 0

def main():
    force = False
    if "--help" in sys.argv:
        print("Usage: ./script.py [OPTION]")
        print("Manage docker-compose services interactively")
        print("\nOptions:")
        print("  -f\tForce start containers without confirmation")
        print("  --help\tShow this help message")
        return
    if "-f" in sys.argv:
        force = True
        print("Force awakened. Skipping confirmation.")

    is_up = check_docker_compose_up()

    if is_up:
        action = "stop"
        msg = "🛑 Stop containers? [y/N] "  # No default
    else:
        action = "start"
        msg = "⚡ Start containers? [Y/n] "  # Yes default

    if not force:
        response = input(msg).strip().lower()
        if action == "stop":
            # Only proceed if user explicitly types 'y'
            if response != "y":
                print("Aborting.")
                return
        else:
            # Proceed unless user types 'n'
            if response == "n":
                print("Aborting.")
                return

    if action == "stop":
        subprocess.run(["docker", "compose", "down"], shell=IS_WINDOWS)
    else:
        subprocess.run(["docker", "compose", "up", "-d"], shell=IS_WINDOWS)

if __name__ == "__main__":
    main()
