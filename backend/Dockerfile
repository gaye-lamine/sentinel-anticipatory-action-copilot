FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend /app/backend
COPY karamoja_9_districts.geojson /app/karamoja_9_districts.geojson
COPY run-test/kmj_seas51_spi3_ond_eprob_2026_07_th0p68_tr15p2_district_averages.csv /app/run-test/kmj_seas51_spi3_ond_eprob_2026_07_th0p68_tr15p2_district_averages.csv

RUN useradd --create-home --uid 10001 sentinel && chown -R sentinel:sentinel /app
USER sentinel

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
