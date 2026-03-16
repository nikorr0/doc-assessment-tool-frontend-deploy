FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
# Install via npm/yarn/pnpm depending on your project
RUN npm ci --no-audit --no-fund
COPY . .
# VITE_API_BASE is used at build time
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# serve via nginx
FROM nginx:1.25-alpine
# Copy Nginx config that supports SPA routing
COPY nginx.conf /etc/nginx/nginx.conf
# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]