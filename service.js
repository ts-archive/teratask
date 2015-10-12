var worker = require('./lib/worker');
var config_schema = require('./system_schema').config_schema;

// This just defines some initialization hooks
var master = require('./lib/master');

var foundation = require('terafoundation')({
    name: 'teratask',
    redis: ['default', 'immediate'],
    worker: worker,
    master: master,
    config_schema: config_schema

});
