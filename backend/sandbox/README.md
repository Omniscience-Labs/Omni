# Agent Sandbox

This directory contains the agent sandbox implementation - a Docker-based virtual environment that agents use as their own computer to execute tasks, access the web, and manipulate files.

## Overview

The sandbox provides a complete containerized Linux environment with:
- Chrome browser for web interactions
- VNC server for accessing the Web User
- Web server for serving content (port 8080) -> loading html files from the /workspace directory
- Full file system access
- Full sudo access

## Customizing the Sandbox

You can modify the sandbox environment for development or to add new capabilities:

1. Edit files in the `docker/` directory
2. Build a custom image:
   ```
   cd backend/sandbox/docker
   docker compose build
   ```
3. Test your changes locally using docker-compose

## Using a Custom Image

To use your custom sandbox image:

1. Change the `image` parameter in `docker-compose.yml` (that defines the image name `kortix/suna:___`)
2. Update the same image name in `backend/sandbox/sandbox.py` in the `create_sandbox` function
3. If using Daytona for deployment, update the image reference there as well
