FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

# Movemos o template do runtime config para fora do diretório servido pelo
# nginx (não queremos expor o template via HTTP). O docker-entrypoint.sh
# expande este template a cada boot do container usando envsubst.
RUN mkdir -p /etc/strips \
 && mv /usr/share/nginx/html/config.js.template /etc/strips/config.js.template \
 && mv /usr/share/nginx/html/docker-entrypoint.sh /docker-entrypoint-stirps.sh \
 && chmod +x /docker-entrypoint-stirps.sh \
 && rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf

ENTRYPOINT ["/docker-entrypoint-stirps.sh"]
