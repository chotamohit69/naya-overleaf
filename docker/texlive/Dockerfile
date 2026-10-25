# TeX Live Docker Image for Naya Overleaf
# Optimized for performance and security

FROM ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=/usr/local/texlive/2023/bin/x86_64-linux:$PATH

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    perl \
    fontconfig \
    make \
    git \
    python3 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Install TeX Live with custom profile (minimal installation for performance)
COPY texlive.profile /tmp/texlive.profile
WORKDIR /tmp
RUN wget -nv https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz && \
    tar -xzf install-tl-unx.tar.gz && \
    cd install-tl-* && \
    ./install-tl --profile=/tmp/texlive.profile && \
    rm -rf /tmp/install-tl*

# Install additional LaTeX packages commonly used in academic papers
RUN tlmgr install \
    latexmk \
    amsmath \
    amscls \
    mathtools \
    babel \
    babel-english \
    pgf \
    graphics \
    xcolor \
    hyperref \
    url \
    parskip \
    listings \
    fancyhdr \
    titlesec \
    geometry \
    booktabs \
    caption \
    enumitem \
    etoolbox \
    tcolorbox \
    environ \
    trimspaces \
    lipsum \
    pdfpages \
    biblatex \
    biber \
    csquotes \
    microtype \
    beamer

# Create compilation directories. /work is world-writable so the non-root
# compiler user can accept files copied in by the worker.
RUN mkdir -p /var/texlive/compilation /work && \
    chmod 0777 /work
WORKDIR /var/texlive/compilation

# Add compilation script
COPY compile.sh /usr/local/bin/compile.sh
RUN chmod +x /usr/local/bin/compile.sh

# Set up a non-root user for security
RUN useradd -m -d /var/texlive/compilation texuser
RUN chown -R texuser:texuser /var/texlive/compilation
USER texuser

# Command to run when container starts
CMD ["/bin/bash"]