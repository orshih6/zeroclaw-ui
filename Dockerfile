# Static build served by nginx, which also passes /api and /ws through to ZeroClaw.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile
COPY . .
# Optional: address of ZeroClaw's own dashboard, linked from Settings.
ARG VITE_DASHBOARD_URL=
ENV VITE_DASHBOARD_URL=$VITE_DASHBOARD_URL
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# ZEROCLAW_UPSTREAM (host:port of the ZeroClaw gateway) is filled into the template when the
# container starts. Set it to where yours is; the default is a Kubernetes Service named
# `zeroclaw` in the namespace `zeroclaw`.
ENV ZEROCLAW_UPSTREAM=zeroclaw.zeroclaw.svc.cluster.local:42617
# NGINX_LOCAL_RESOLVERS is taken from /etc/resolv.conf by the image's entrypoint.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
ENV NGINX_ENVSUBST_FILTER="ZEROCLAW_|NGINX_LOCAL_RESOLVERS"
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
