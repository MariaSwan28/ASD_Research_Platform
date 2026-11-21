FROM python:3.10-slim-bookworm

WORKDIR /app

# Устанавливаем системные зависимости
# libgl1-mesa-glx заменён на libgl1 + libglx0 + libopengl0
# Use HTTPS and retry transient download failures; keep TLS verification enabled.
RUN set -eux; \
    if [ ! -s /etc/ssl/certs/ca-certificates.crt ]; then \
        mkdir -p /etc/ssl/certs; \
        python -c "import shutil; from pip._vendor import certifi; shutil.copyfile(certifi.where(), '/etc/ssl/certs/ca-certificates.crt')"; \
    fi; \
    for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do \
        if [ -f "$source" ]; then \
            sed -i 's|http://deb.debian.org|https://deb.debian.org|g; s|http://security.debian.org|https://security.debian.org|g' "$source"; \
        fi; \
    done; \
    printf '%s\n' 'Acquire::Retries "5";' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' > /etc/apt/apt.conf.d/80-network-retries; \
    apt-get -o APT::Update::Error-Mode=any update; \
    apt-get install -y --no-install-recommends ca-certificates libgl1 libglx0 libopengl0 libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 ffmpeg; \
    rm -rf /var/lib/apt/lists/*

# Обновляем pip
RUN pip install --upgrade pip

COPY requirements.txt video-requirements.txt ./

# Устанавливаем PyTorch CPU
RUN pip install --no-cache-dir torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cpu

# Устанавливаем остальные зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Проверяем критический импорт
RUN python -c "import cv2; print('OpenCV OK:', cv2.__version__)"

# The video pickle was trained with sklearn 1.3.0; text uses 1.2.2.
RUN python -m venv --system-site-packages /opt/video-env && /opt/video-env/bin/pip install --no-cache-dir --no-deps -r video-requirements.txt
ENV VIDEO_PYTHON=/opt/video-env/bin/python
COPY . .

RUN mkdir -p dataset models files logs

EXPOSE 5010

CMD ["gunicorn", "--bind", "0.0.0.0:5010", "--workers", "1", "--threads", "8", "--timeout", "1260", "--access-logfile", "-", "server:app"]