var theconfig = {};
var argv = require('minimist')(process.argv.slice(2));

// configure the CouchDB paramss
theconfig.COUCH_URL = 'http://localhost:5984';
theconfig.COUCH_DATABASE = 'test';
theconfig.COUCH_PARALLELISM = 5;
theconfig.COUCH_BUFFER_SIZE = 500;

// if we have a custom CouchDB url
if( typeof process.env.COUCH_URL !== 'undefined') {
  theconfig.COUCH_URL = process.env.COUCH_URL;
}

// if we have a specified databases
if( typeof process.env.COUCH_DATABASE !== 'undefined') {
  theconfig.COUCH_DATABASE = process.env.COUCH_DATABASE;
}

// if we have a specified buffer size
if( typeof process.env.COUCH_BUFFER_SIZE !== 'undefined') {
  theconfig.COUCH_BUFFER_SIZE = parseInt(process.env.COUCH_BUFFER_SIZE);
}

// if we have a specified parallelism
if( typeof process.env.COUCH_PARALLELISM !== 'undefined') {
  theconfig.COUCH_PARALLELISM = parseInt(process.env.COUCH_PARALLELISM);
}


// override with command-line parameters
if(argv.url) {
  theconfig.COUCH_URL = argv.url;
}
if(argv.db) {
  theconfig.COUCH_DATABASE = argv.db;
}
if(argv.buffer) {
  theconfig.COUCH_BUFFER_SIZE = parseInt(argv.buffer);
}
if(argv.parallelism) {
  theconfig.COUCH_PARALLELISM = parseInt(argv.parallelism);
}

console.error('******************');
console.error(' COUCHBACKUP/RESTORE - configuration')
console.error('  ', JSON.stringify(theconfig, null, ' ').replace(/\/\/.+@/g, '//****:****@'));
console.error('******************')

module.exports = theconfig;
