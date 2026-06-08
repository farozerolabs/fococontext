FROM python:3.12-slim-bookworm AS build

ENV PYTHONDONTWRITEBYTECODE="1"
ENV PYTHONUNBUFFERED="1"
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app
RUN python -m venv /opt/venv

COPY apps/ocr-service/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir -r /app/requirements.txt \
  && python -m pip uninstall -y opencv-python \
  && python -m pip install --no-cache-dir --force-reinstall opencv-python-headless==4.13.0.92

FROM python:3.12-slim-bookworm AS runtime

ARG FOCOCONTEXT_RELEASE_VERSION="dev"
ARG FOCOCONTEXT_RELEASE_REVISION="unknown"
ARG FOCOCONTEXT_RELEASE_BUILD_TIME="unknown"
ARG FOCOCONTEXT_RELEASE_SOURCE="local"

LABEL org.opencontainers.image.title="FocoContext OCR Service" \
  org.opencontainers.image.version="${FOCOCONTEXT_RELEASE_VERSION}" \
  org.opencontainers.image.revision="${FOCOCONTEXT_RELEASE_REVISION}" \
  org.opencontainers.image.created="${FOCOCONTEXT_RELEASE_BUILD_TIME}" \
  org.opencontainers.image.source="${FOCOCONTEXT_RELEASE_SOURCE}"

ENV PYTHONDONTWRITEBYTECODE="1"
ENV PYTHONUNBUFFERED="1"
ENV OCR_SERVICE_PORT="18082"
ENV FOCOCONTEXT_RELEASE_VERSION="${FOCOCONTEXT_RELEASE_VERSION}"
ENV FOCOCONTEXT_RELEASE_REVISION="${FOCOCONTEXT_RELEASE_REVISION}"
ENV FOCOCONTEXT_RELEASE_BUILD_TIME="${FOCOCONTEXT_RELEASE_BUILD_TIME}"
ENV FOCOCONTEXT_RELEASE_SOURCE="${FOCOCONTEXT_RELEASE_SOURCE}"
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY apps/ocr-service/fococontext_ocr_service /app/fococontext_ocr_service

EXPOSE 18082

CMD ["python", "-m", "uvicorn", "fococontext_ocr_service.main:app", "--host", "0.0.0.0", "--port", "18082"]
