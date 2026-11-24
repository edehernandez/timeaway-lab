# Purpose: the tests' runner image (harness rule 1): Playwright and its browsers come with the base image,
# the test dependencies are installed here at /node_modules, once — never at start. /app is the mounted tree.
FROM mcr.microsoft.com/playwright:v1.65.0-noble
RUN npm install -g pnpm@12.18.0
WORKDIR /
COPY tests/package.json tests/pnpm-lock.yaml /
RUN pnpm install --frozen-lockfile
WORKDIR /app
