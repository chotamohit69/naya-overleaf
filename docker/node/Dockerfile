FROM node:18-alpine AS client-build

WORKDIR /app

COPY package.json package-lock.json ./
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci --no-audit --no-fund

COPY webpack.config.js ./
COPY src/client ./src/client
COPY public/index.html ./public/index.html
COPY public/images ./public/images
RUN npm run build

FROM node:18-alpine

# The compilation worker shells out to the Docker daemon through the mounted socket.
# The CLI is small and does not include the daemon itself.
RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional

COPY . .
COPY --from=client-build /app/public ./public

ENV NODE_ENV=production
EXPOSE 3000 3001

CMD ["npm", "run", "start"]
