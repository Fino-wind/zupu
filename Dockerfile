# --- Ñ˙6µ ---
FROM node:18-alpine as builder
WORKDIR /app
# 6ùVMn
COPY package*.json ./
RUN npm install
# 6ê
COPY . .
# Ñ˙MÔ ( dist ÓU)
RUN npm run build

# --- –L6µ ---
FROM node:18-alpine
WORKDIR /app

# â≈ Nginx
RUN apk add --no-cache nginx

# ∆ÔØÉ
COPY package*.json ./
RUN npm install --production
COPY server.js ./
# ÀzÑpnìáˆ(ÇúX()ÂM/®•
RUN touch genealogy.db

# ŒÑ˙6µ6MÔßi0 Nginx ÓU
COPY --from=builder /app/dist /usr/share/nginx/html

# Mn Nginx: Yáˆp Nginx/api ˜Bl—Ÿ Node Ô
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://127.0.0.1:3001; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
    } \
}' > /etc/nginx/http.d/default.conf

# ¥2 80 Ô„
EXPOSE 80

# /®,: vL/® Nginx å Node Ô
CMD nginx && node server.js
