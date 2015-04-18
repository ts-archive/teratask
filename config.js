/* 
 ********************************************************
 Framework configuration defaults. 

 These can be overridden by a service local config.js
 ********************************************************
*/

var config = {};

/*
 Application environment.
 */

config.environment = 'development';

config.log_path = '/app/logs';

/*
 ***********************
 MongoDB Configuration
 ***********************
 */
config.mongodb = {};

config.mongodb.default = {
    servers: "mongodb://localhost:27017/m2m"
};

//config.mongodb.servers = "mongodb://localhost:27017/test";

//config.mongodb.replicaSet = 'app';

//config.mongodb.replicaSetTimeout = 30000;

config.redis = {};

config.redis.default = {
    host: '127.0.0.1'
};

config.redis.immediate = {
    host: '127.0.0.1'
};

config.teratask = {};

/*
 * Tasks are defined as NPM modules.
 */
config.teratask.tasks = ['m2m_tasks'];

module.exports = config;
