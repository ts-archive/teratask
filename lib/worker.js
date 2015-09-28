'use strict';

module.exports = function(context) {
    var config = context.sysconfig;
    var logger = context.logger;
    var cluster = context.cluster;

    var Scheduler = require('./scheduler')(context).Scheduler;

    var redis_client_default = context.foundation.getConnection({
        type: 'redis',
        endpoint: 'default',
        cached: true
    }).client;

    var redis_client_immediate = context.foundation.getConnection({
        type: 'redis',
        endpoint: 'immediate',
        cached: true
    }).client;

    var scheduler = new Scheduler(redis_client_default, redis_client_immediate);

    function shutdown() {
        logger.info("Worker " + cluster.worker.id + " stopping.");
        scheduler.stop(function() {
            process.exit();
        });
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Load in the application specific import tasks
    config.teratask.tasks.forEach(function(module) {
        var task = require(module);

        task.configure(context, scheduler);
    })

};