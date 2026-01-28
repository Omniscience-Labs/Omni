#!/usr/bin/env python3

import subprocess
import sys
import platform
import os
import json

IS_WINDOWS = platform.system() == "Windows"
PROGRESS_FILE = ".setup_progress"


# --- ANSI Colors ---
class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"


def load_progress():
    """Loads the last saved step and data from setup."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            try:
                return json.load(f)
            except (json.JSONDecodeError, KeyError):
                return {"step": 0, "data": {}}
    return {"step": 0, "data": {}}

def get_setup_method():
    """Gets the setup method chosen during setup."""
    progress = load_progress()
    return progress.get("data", {}).get("setup_method")

def check_supermemory_env():
    """Checks if the Supermemory API Key is present in the environment or .env file."""
    if os.environ.get("SUPERMEMORY_API_KEY"):
        return True
    
    # Check .env file in backend
    env_path = os.path.join("backend", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            if "SUPERMEMORY_API_KEY" in f.read():
                return True
                
    print(f"{Colors.RED}❌ Supermemory API Key missing!{Colors.ENDC}")
    print(f"{Colors.YELLOW}Please add SUPERMEMORY_API_KEY to your backend/.env file to enable V3 memory.{Colors.ENDC}")
    return False

def check_docker_available():
    """Check if Docker is available and running."""
    try:
        result = subprocess.run(["docker", "version"], capture_output=True, shell=IS_WINDOWS, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"{Colors.RED}❌ Docker is not running or not installed.{Colors.ENDC}")
        print(f"{Colors.YELLOW}Please start Docker and try again.{Colors.ENDC}")
        return False

def check_docker_compose_up():
    result = subprocess.run(
        ["docker", "compose", "ps", "-q"],
        capture_output=True,
        text=True,
        shell=IS_WINDOWS,
    )
    return len(result.stdout.strip()) > 0

def print_manual_instructions():
    """Prints updated V3 instructions for starting services with Supermemory."""
    progress = load_progress()
    supabase_setup_method = progress.get("data", {}).get("supabase_setup_method")
    
    print(f"\n{Colors.BLUE}{Colors.BOLD}🚀 V3 Manual Startup Instructions (Supermemory Enabled){Colors.ENDC}\n")

    print("To start the V3 environment, run these commands in separate terminals:\n")

    step_num = 1
    
    if supabase_setup_method == "local":
        print(f"{Colors.BOLD}{step_num}. Start Local Supabase (Data Storage):{Colors.ENDC}")
        print(f"{Colors.CYAN}   cd backend && npx supabase start{Colors.ENDC}\n")
        step_num += 1

    print(f"{Colors.BOLD}{step_num}. Start Infrastructure (Redis for Task Queue):{Colors.ENDC}")
    print(f"{Colors.CYAN}   docker compose up redis -d{Colors.ENDC}\n")
    step_num += 1

    print(f"{Colors.BOLD}{step_num}. Start V3 Frontend:{Colors.ENDC}")
    print(f"{Colors.CYAN}   cd frontend && npm run dev{Colors.ENDC}\n")
    step_num += 1

    print(f"{Colors.BOLD}{step_num}. Start V3 API (with Memory Service):{Colors.ENDC}")
    print(f"{Colors.CYAN}   cd backend && uv run api.py{Colors.ENDC}\n")
    step_num += 1

    print(f"{Colors.BOLD}{step_num}. Start Background Worker (Mem0 -> Supermemory Sync):{Colors.ENDC}")
    print(
        f"{Colors.CYAN}   cd backend && uv run dramatiq run_agent_background{Colors.ENDC}\n"
    )

    print(f"Once all services are running, access the V3 app at: {Colors.BOLD}http://localhost:3000{Colors.ENDC}\n")
    print(f"{Colors.GREEN}💡 Note: V2 memories are being migrated in the background.{Colors.ENDC}")


def main():
    setup_method = get_setup_method()

    if "--help" in sys.argv:
        print("Usage: ./start.py [OPTION]")
        print("Manage Suna services based on your setup method")
        print("\nOptions:")
        print("  -f\tForce start containers without confirmation")
        print("  --help\tShow this help message")
        return

    # Check for Supermemory before starting
    if not check_supermemory_env():
        # We don't return here so infra can still start, but we warn the user
        pass

    if not setup_method:
        print(
            f"{Colors.YELLOW}⚠️  Setup method not detected. Defaulting to Docker Compose.{Colors.ENDC}"
        )
        setup_method = "docker"

    if setup_method == "manual":
        print(f"{Colors.BLUE}{Colors.BOLD}Manual Setup Detected (V3 Mode){Colors.ENDC}")
        print("Managing infrastructure services (Redis)...\n")

        force = "-f" in sys.argv
        
        is_infra_up = subprocess.run(
            ["docker", "compose", "ps", "-q", "redis"],
            capture_output=True,
            text=True,
            shell=IS_WINDOWS,
        )
        is_up = len(is_infra_up.stdout.strip()) > 0

        if is_up:
            action = "stop"
            msg = "🛑 Stop infrastructure services? [y/N] "
        else:
            action = "start"
            msg = "⚡ Start infrastructure services? [Y/n] "

        if not force:
            response = input(msg).strip().lower()
            if action == "stop" and response != "y": return
            if action == "start" and response == "n": return

        if action == "stop":
            subprocess.run(["docker", "compose", "down"], shell=IS_WINDOWS)
            print(f"\n{Colors.GREEN}✅ Infrastructure services stopped.{Colors.ENDC}")
        else:
            subprocess.run(
                ["docker", "compose", "up", "redis", "-d"], shell=IS_WINDOWS
            )
            print(f"\n{Colors.GREEN}✅ Infrastructure services started.{Colors.ENDC}")
            print_manual_instructions()

    else:  # docker setup
        print(f"{Colors.BLUE}{Colors.BOLD}Docker V3 Setup Detected{Colors.ENDC}")
        if not check_docker_available(): return
            
        is_up = check_docker_compose_up()
        action = "stop" if is_up else "start"
        msg = "🛑 Stop all services? [y/N] " if is_up else "⚡ Start all services? [Y/n] "

        if "-f" not in sys.argv:
            response = input(msg).strip().lower()
            if action == "stop" and response != "y": return
            if action == "start" and response == "n": return

        if action == "stop":
            subprocess.run(["docker", "compose", "down"], shell=IS_WINDOWS)
            print(f"\n{Colors.GREEN}✅ V3 environment stopped.{Colors.ENDC}")
        else:
            subprocess.run(["docker", "compose", "up", "-d"], shell=IS_WINDOWS)
            print(f"\n{Colors.GREEN}✅ V3 environment started with Supermemory.{Colors.ENDC}")
            print(f"{Colors.CYAN}🌐 Access at: http://localhost:3000{Colors.ENDC}")


if __name__ == "__main__":
    main()