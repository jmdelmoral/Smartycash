FROM 424037597550.dkr.ecr.us-east-2.amazonaws.com/base:amd64-node-22.14-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /src/app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /src/app
COPY --from=deps /src/app/node_modules ./node_modules
COPY . .


ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /src/app
ENV NODE_ENV=production

RUN apk add --no-cache ca-certificates

COPY certs/digicert-global-g2-ca.crt /usr/local/share/ca-certificates/digicert-global-g2-ca.crt

RUN ls -la /usr/local/share/ca-certificates/

RUN update-ca-certificates

RUN cp /usr/local/share/ca-certificates/digicert-global-g2-ca.crt /etc/ssl/certs/

ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/digicert-global-g2-ca.crt


COPY --from=builder /src/app/public ./public
COPY --from=builder /src/app/.next/standalone ./
COPY --from=builder /src/app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
