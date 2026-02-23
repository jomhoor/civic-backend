FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy everything
COPY . .

# Generate Prisma client (needs a dummy DATABASE_URL for the config loader)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
ENV DATABASE_URL=""

EXPOSE 3001

# Push schema to DB, seed questions, then start dev server with hot-reload
CMD ["sh", "-c", "npm ci && npx prisma generate && npx prisma db push --accept-data-loss && npm run start:dev"]
