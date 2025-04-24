FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm install

# Copy the frontend code
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]