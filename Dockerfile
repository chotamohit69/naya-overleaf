# Hosted preview image for Render.
#
# Render does not provide a Docker socket, MongoDB, or RabbitMQ, so this image
# runs the app with an in-memory database and the local LaTeX compiler backend.
# Production deployments should use docker/node/Dockerfile with the full stack.

FROM node:18-bookworm AS client-build

WORKDIR /app

COPY package.json package-lock.json ./
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci --no-audit --no-fund

COPY webpack.config.js ./
COPY src/client ./src/client
COPY public/index.html ./public/index.html
COPY public/images ./public/images
RUN npm run build

FROM node:18-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    latexmk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
COPY --from=client-build /app/public ./public

ENV NODE_ENV=development
ENV PREVIEW_MODE=true
ENV AI_ENABLED=false

EXPOSE 10000

CMD ["npm", "run", "preview"]
