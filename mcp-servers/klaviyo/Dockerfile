FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Expose port for HTTP server
EXPOSE 3010

# Start the server
CMD ["node", "dist/http-server.js"]

