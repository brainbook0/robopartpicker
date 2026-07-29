FROM ghcr.io/astral-sh/uv:0.11.1@sha256:fc93e9ecd7218e9ec8fba117af89348eef8fd2463c50c13347478769aaedd0ce AS uv

FROM python:3.13.14-slim-trixie@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91 AS builder
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-install-project --no-editable
COPY src ./src
RUN uv sync --locked --no-editable

FROM python:3.13.14-slim-trixie@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91 AS runtime
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN groupadd --system --gid 10001 collector \
    && useradd --system --uid 10001 --gid collector --create-home collector
WORKDIR /app
COPY --from=builder --chown=collector:collector /app/.venv /app/.venv
USER 10001:10001
ENTRYPOINT ["rpp-collector"]
