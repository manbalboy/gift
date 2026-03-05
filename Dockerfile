FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt /tmp/api-requirements.txt
RUN pip install -r /tmp/api-requirements.txt

COPY web/package.json web/package-lock.json /app/web/
RUN cd /app/web && npm ci

COPY . /app

RUN chmod +x /app/scripts/run-preview.sh

EXPOSE 7000 7001

CMD ["/app/scripts/run-preview.sh"]
