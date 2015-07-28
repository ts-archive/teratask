'use strict';

module.exports = function (context) {
    var config = context.sysconfig;
    var logger = context.logger;
    var cluster = context.cluster;

    var Scheduler = require('./scheduler')(context).Scheduler;

    //var tasks = require('./tasks');
    //var util = require('./lib/util');
    var scheduler = new Scheduler(context.redis.default, context.redis.immediate);

    function shutdown() {
        logger.info("Worker " + cluster.worker.id + " stopping.");
        scheduler.stop(function () {
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