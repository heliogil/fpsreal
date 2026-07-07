#!/bin/bash
# Corre este script após DNS propagar para obter HTTPS
# Verificar DNS: dig +short reidofps.com.br A
set -e
certbot --nginx -d reidofps.com.br -d www.reidofps.com.br   --non-interactive --agree-tos --email heliogil@gmail.com   --redirect
echo "HTTPS activo em https://reidofps.com.br"
