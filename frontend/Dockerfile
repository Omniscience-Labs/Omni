FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm install

# Copy the frontend code
COPY . .


EXPOSE 3000

# Default command is dev, but can be overridden in docker-compose
CMD ["npm", "run", "dev"]