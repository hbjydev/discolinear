FROM oven/bun:1 AS build

WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.ts .
RUN bun build . --compile --outfile=discolinear

FROM rockylinux/rockylinux:9-minimal AS run

COPY --from=build /build/discolinear /discolinear

ENTRYPOINT [ "/discolinear" ]
