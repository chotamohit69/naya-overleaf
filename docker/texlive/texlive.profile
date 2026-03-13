# TeX Live installation profile for Naya Overleaf
# Optimized for minimal installation size and performance

# Basic settings
selected_scheme scheme-basic
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0

# Installation directory
TEXDIR /usr/local/texlive/2023
TEXMFCONFIG ~/.texlive2023/texmf-config
TEXMFHOME ~/texmf
TEXMFLOCAL /usr/local/texlive/texmf-local
TEXMFSYSCONFIG /usr/local/texlive/2023/texmf-config
TEXMFSYSVAR /usr/local/texlive/2023/texmf-var
TEXMFVAR ~/.texlive2023/texmf-var

# Installation options
instopt_adjustpath 0
instopt_adjustrepo 1
instopt_letter 0
instopt_portable 0
instopt_write18_restricted 1

# Language settings
tlpdbopt_autobackup 0
tlpdbopt_backupdir tlpkg/backups
tlpdbopt_create_formats 1
tlpdbopt_desktop_integration 0
tlpdbopt_file_assocs 0
tlpdbopt_generate_updmap 0
tlpdbopt_post_code 1
tlpdbopt_sys_bin /usr/local/bin
tlpdbopt_sys_info /usr/local/share/info
tlpdbopt_sys_man /usr/local/share/man