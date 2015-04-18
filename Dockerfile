FROM nodejs_service
MAINTAINER v0.1

ENV NODE_PATH /var/import/node_modules:$NODE_PATH

ADD . /var/import/
RUN cd /var/import/ && npm install
#ADD ./supervisor-touchpoint.conf /etc/supervisor/conf.d/

#CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]  
CMD ["/usr/bin/node", "--max-old-space-size=4096", "/var/import/manager.js"] 