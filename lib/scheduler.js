'use strict';

var logger;

var MAX_IN_FLIGHT = 10;

var PROCESSING_QUEUE = 'tp:import:processing';

module.exports = function(context) {
    logger = context.logger;

    var Scheduler = function(redis_client, redis_immediate, done) {
        this.redis_client = redis_client;
        this.redis_immediate = redis_immediate;

        this.tasks = {};   

        this.running = true;

        var obj = this;
        // Schedule the periodic display of active tasks
        setInterval(function() { obj.active_tasks() }, 30000);

        // Setup the listener to receive notifications when there are immediate tasks available.
        if (this.redis_immediate) {
            logger.info("Setting up listener on tp:tasks:immediate");
            this.redis_immediate.subscribe("tp:tasks:immediate");
            this.redis_immediate.on('message', function(channel, task) {
                if (task && obj.tasks[task]) {
                    obj.check_queue(obj.tasks[task]);
                }            
            });        
        }
        
        // If there is a callback then we're starting up and we clear the processing queue. 
        // TODO: this only works for a single server. If we need to scale import across servers
        // this will require a different solution.
        // If the queue is not cleared then items can get deadlocked    
        if (done) {
            this.redis_client.del(PROCESSING_QUEUE, function(err) {            
                if (err) {
                    logger.error("Error encountered while clearing queue: " + PROCESSING_QUEUE + " " + err);            
                }   

                logger.info("Clearing the processing queue: " + PROCESSING_QUEUE)
                // The queue is cleared so we can continue
                done();
            });        
        }    
    }

    /*
     * config variables
     *
     * task_name - the name of the task
     * queue_name - the name of the queue to read jobs from
     * task - The callback to use to perform the work
     * interval - How often in ms to run the task
     * max_in_flight - How many work units can be active at any given time
     *
     */ 
    Scheduler.prototype.schedule = function(config) {
        var obj = this;
        var task_name = config.task_name;
        if (! task_name) {
            logger.error("task_name: can not schedule a task with no name.");
            return;
        }

        if (! config.queue_name) {
            logger.error("queue_name: you must provide the name of the redis queue to process");
            return;    
        }

        if (! config.interval) {
            logger.error("interval: an interval in ms must be provided.");
            return;    
        }

        if (! config.task) {
            logger.error("task: you must provide a task call back function to handle the work");
            return;    
        }

        if (! config.max_in_flight) {
            config.max_in_flight = 10;
        }

        if (! ('enabled' in config)) {
            config.enabled = true;
        }
        
        this.tasks[task_name] = config
        this.tasks[task_name].inflight = 0;
        this.tasks[task_name].timer = setInterval(function() {
            obj.check_queue(config)
        }, config.interval); 
    }

    Scheduler.prototype.task_complete = function(config, item_id) {    
        this.redis_client.srem(PROCESSING_QUEUE, config.task_name + ":" + item_id, function(err) {            
            if (err) {
                logger.error("Error encountered while attempting to unlock: " + item_id + 
                    " for " + config.task_name + " . This may result in a deadlock on the ID: " + err);            
            }
        });
    }

    Scheduler.prototype.run_task = function(config, item_id) {
        var obj = this;
        if (item_id) {                
            obj.tasks[config.task_name].inflight++;  

            config.task(item_id, function(recheck, requeue_item_id) {            
                obj.task_complete(config, item_id);
                obj.tasks[config.task_name].inflight--;

                // Now that we've freed a spot, if the task allows it we'll continue to 
                // schedule until the queue is clear.
                if (recheck) {    
                    process.nextTick(function() {
                        // if we received the item_id back then we should requeue it for further processing.                    
                        if (requeue_item_id) {
    //logger.info("Adding: " + requeue_item_id)                        
                            obj.add_item(config.queue_name, requeue_item_id)
                        }

                        obj.check_queue(config);
                    })                    
                } 
            })
            
            // As long as there are available slots we'll keep kicking off new tasks. 
            // This will run when the function is called and if there are no running tasks will
            // kick off max_in_flight tasks right away.
            if (obj.tasks[config.task_name].inflight < obj.tasks[config.task_name].max_in_flight) { 
                //logger.info("Slots available for " + config.task_name);
                process.nextTick(function() {
                    obj.check_queue(config);
                }) 
            }
            else {
                //logger.info("No slots available ... waiting for " + config.task_name);
            }            
        }
    }

    Scheduler.prototype.check_queue = function(config) {    
        // We add a couple extra slots so this process doesn't get completely blocked out
        if (this.running && config.enabled && (this.tasks[config.task_name].inflight < this.tasks[config.task_name].max_in_flight)) { 
            var obj = this;       
            
            var lock_queue = PROCESSING_QUEUE + ":" + config.task_name;

            /* This script is intended to automically get a member from a set, remove the member from the set
             * and then add that to a new set. If the member already exists in the new set then the member is 
             * considered to be locked. The result is an array [lock, item], 
             * If lock is 0 then the item is locked, otherwise the item is unlocked and ready for processing.
             * The item will remain locked until it is explicitly removed from the processing list.
             *
             * Caveats to this implementation:
             *
             * The use of smembers here is very problematic if the queue is large, however redis will
             * not allow the use of spop within a lua script and srandmember followed by a remove of that 
             * member is also not allowed.
             *
             * This assumes that if the key is pulled and is found to be locked that it's then safe to remove
             * it from the queue because it's already being processed. If it turns out the processing is dead
             * and the lock is stale then this is problematic. It's easy to restrict the removal to only occur
             * if the item is unlocked but then subsequent calls to smembers always return the same thing and
             * nothing new gets scheduled to run even if there are slots available.
             *
             * TODO: cache the script when the scheduler starts and call the cached version here.
             */
            var script = "local members = redis.call('smembers', KEYS[1]);" +
                "math.randomseed(ARGV[2]);" +                        
                "local item = nil;" +
                "    redis.log(redis.LOG_WARNING, 'Queue: ' .. #members);" +
                "if #members ~= 0 then" +
                "    item = members[math.random(#members)]; " +
                "end;" +
                "local result = {-1, nil};" +
                "if item then" +
                "    redis.log(redis.LOG_WARNING, 'Item: ' .. item);" +
                "    local lock = redis.call('sadd', KEYS[2], (ARGV[1] .. ':' .. item));" +
                "    if (lock ~= 0) then " +
                "        redis.call('srem', KEYS[1], item);" +            
                "    end;" +
                "    result = {lock, item};" +            
                //"    redis.log(redis.LOG_WARNING, 'Returning: ' .. item .. ' lock: ' .. lock);" +
                "end;" +
                "return result;";        
    //logger.error("Grabbing new record for " + config.task_name)            
            this.redis_client.eval([script, 2, config.queue_name, PROCESSING_QUEUE, config.task_name, Date.now()], function(err, result) {
                if (err) {
                    logger.error("An error occured in get item for processing: " + err);
                    return;
                }

                if (result) {
                    // 0 is locked, 1 is unlocked
                    var lock = result[0];
                    var item_id = result[1];
    //logger.info("Before Processing " + item_id + ' ' + lock)
                    // If we found an ID and it's not locked then run the task.
                    if (lock > 0 && item_id) { 
    //logger.info('Processing ' + item_id)
                        obj.run_task(config, item_id)                    
                    }  
                    else {
    //                    logger.info(config.task_name + ": locked " + item_id)
                    }              
                }                
            })
        }
    }

    Scheduler.prototype.active_tasks = function() {
        if (this.running) {
            this.redis_client.smembers(PROCESSING_QUEUE, function(err, members) {
                if (members) {
                    logger.info("Active tasks");
                    logger.info("===================");
                    for (var i = 0; i < members.length; i++) {
                        logger.info(members[i])
                    }

                    logger.info("===================");
                }
            });           
        }
    }

    Scheduler.prototype.stop = function(done) {
        logger.info("Scheduler is stopping.");
        this.running = false;
        if (done) done();
    }

    Scheduler.prototype.add_item = function(bucket, item) {
        if (item) {
            this.redis_client.sadd(bucket, item, function(err, response) {
                if (err) {
                    logger.error("Error adding item: " + item + " to " + bucket + " " + err)
                }
            });    
        } 
    }

    return {
        Scheduler: Scheduler
    };    
}
