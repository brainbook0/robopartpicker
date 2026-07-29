FROM docker.io/cloudflare/sandbox:0.12.4-python

# Trusted, allowlisted import processors only. Uploaded scripts are never executed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    assimp-utils \
    file \
    libxml2-utils \
    poppler-utils \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    lxml==5.4.0 \
    openpyxl==3.1.5 \
    pyyaml==6.0.2

COPY sandbox/import_processor.py /opt/robopartpicker/import_processor.py
