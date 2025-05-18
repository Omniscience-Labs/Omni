FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    netcat-traditional \
    gnupg \
    curl \
    unzip \
    zip \
    xvfb \
    libgconf-2-4 \
    libxss1 \
    libnss3 \
    libnspr4 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    fonts-liberation \
    dbus \
    xauth \
    xvfb \
    x11vnc \
    tigervnc-tools \
    supervisor \
    net-tools \
    procps \
    git \
    python3-numpy \
    fontconfig \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    tmux \
    # PDF Processing Tools
    poppler-utils \
    wkhtmltopdf \
    # Document Processing Tools
    antiword \
    unrtf \
    catdoc \
    # Text Processing Tools
    grep \
    gawk \
    sed \
    # File Analysis Tools
    file \
    # Data Processing Tools
    jq \
    csvkit \
    xmlstarlet \
    # Additional Utilities
    less \
    vim \
    tree \
    rsync \
    lsof \
    iputils-ping \
    dnsutils \
    sudo \
    # Chromium dependencies
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Install Cloudflare Wrangler CLI globally
RUN npm install -g wrangler

# Install noVNC
RUN git clone https://github.com/novnc/noVNC.git /opt/novnc \
    && git clone https://github.com/novnc/websockify /opt/novnc/utils/websockify \
    && ln -s /opt/novnc/vnc.html /opt/novnc/index.html

# Set platform for ARM64 compatibility
ARG TARGETPLATFORM=linux/amd64

# Set up working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server script
COPY . /app
COPY server.py /app/server.py
COPY browser_api.py /app/browser_api.py

# Install Playwright and browsers with system dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Install Playwright package first
RUN pip install playwright
# Then install dependencies and browsers
RUN playwright install-deps
RUN playwright install chromium
# Verify installation
RUN python -c "from playwright.sync_api import sync_playwright; print('Playwright installation verified')"

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CHROME_PATH=/usr/bin/chromium
ENV ANONYMIZED_TELEMETRY=false
ENV DISPLAY=:99
ENV RESOLUTION=1024x768x24
ENV VNC_PASSWORD=vncpassword
ENV CHROME_PERSISTENT_SESSION=true
ENV RESOLUTION_WIDTH=1024
ENV RESOLUTION_HEIGHT=768
# Add Chrome stability flags
ENV CHROME_FLAGS="--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --disable-extensions --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-breakpad --disable-component-extensions-with-background-pages --disable-features=TranslateUI,BlinkGenPropertyTrees --disable-ipc-flooding-protection --disable-renderer-backgrounding --enable-features=NetworkService,NetworkServiceInProcess --force-color-profile=srgb --metrics-recording-only --mute-audio"
# Add Playwright specific settings
ENV PLAYWRIGHT_SKIP_BROWSER_GC=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Set up supervisor configuration
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 7788 6080 5901 8000 8080

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]