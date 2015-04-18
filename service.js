var worker = require('./lib/worker');

// This just defines some initialization hooks
var master = require('./lib/master');

var foundation = require('terafoundation')({
    name: 'TeraTask',
    mongodb: ['default'],
    redis: ['default', 'immediate'],
    worker: worker,
    master: master
});
