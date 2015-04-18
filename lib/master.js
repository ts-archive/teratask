'use strict';

var Scheduler, logger, redis;

module.exports = function(context) {
    logger = context.logger;
    redis = context.redis.default;
    
    Scheduler = require('./scheduler')(context).Scheduler;

    var api = {
        pre: pre_init,
        post: post_init
    }

    return api;
}

function pre_init() {

}

function post_init() {
    // Create the scheduler so that it clears the processing queue before we start any workers.
    var scheduler = new Scheduler(redis, null, function() {
        // We don't want the scheduler to really be running in the master.
        logger.info("Stopping the scheduler in the master. It will run in the children.")
        scheduler.stop();
    })
}
