FROM node:22-alpine AS base

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock* package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Expose Vite dev port
EXPOSE 5173

# Run development server listening on all network interfaces
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
