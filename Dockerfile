FROM node:18-alpine AS builder
WORKDIR /app

# 先复制依赖文件（哪个存在用哪个）
COPY package.json ./
COPY package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# 安装依赖（根据锁文件自动选择）
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \
    else npm i; fi

COPY . .
RUN if [ -f yarn.lock ]; then yarn build; \
    elif [ -f pnpm-lock.yaml ]; then pnpm build; \
    else npm run build; fi

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8888
CMD ["nginx", "-g", "daemon off;"]
