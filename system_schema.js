'use strict';

var schema = {
    tasks: {
        doc: '',
        default: ['m2m_tasks']
    },

    redis: {
        immediate: {
            doc: '',
            default: {
                host: '127.0.0.1'
            }
        }
    }

};


function config_schema(config) {
    var config = config;
    //TODO do something with config if needed

    return schema;
}

module.exports = {
    config_schema: config_schema,
    schema: schema
};