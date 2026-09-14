FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/policy/package.json packages/policy/package.json
COPY server/package.json server/package.json
COPY agent/package.json agent/package.json
COPY controller/package.json controller/package.json
COPY tools/package.json tools/package.json
COPY dashboard/package.json dashboard/package.json
COPY cli/package.json cli/package.json
COPY installer/package.json installer/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS master
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
RUN useradd --system --uid 10001 --home /var/lib/aegisforge --create-home aegisforge
COPY --from=build --chown=aegisforge:aegisforge /app /app
USER aegisforge
EXPOSE 8787
CMD ["node","server/dist/index.js"]

FROM master AS agent
CMD ["node","agent/dist/index.js"]
