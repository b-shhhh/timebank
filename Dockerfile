# Backend Dockerfile
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
RUN npx prisma generate

FROM node:20-alpine AS backend
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY backend/ .
EXPOSE 4000
CMD ["npm", "start"]

# Frontend Dockerfile
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine AS frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]