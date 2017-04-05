var theconfig = {};
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');

// configure the CouchDB paramss
theconfig.COUCH_URL = 'http://localhost:5984';
theconfig.COUCH_DATABASE = 'test';
theconfig.COUCH_PARALLELISM = 5;
theconfig.COUCH_BUFFER_SIZE = 500;
theconfig.COUCH_LOG = null;
theconfig.COUCH_RESUME = false;
theconfig.COUCH_OUTPUT = null;

// if we have a custom CouchDB url
if( typeof process.env.COUCH_URL !== 'undefined') {
  theconfig.COUCH_URL = process.env.COUCH_URL;
}

// if we have a specified databases
if (typeof process.env.COUCH_DATABASE !== 'undefined') {
  theconfig.COUCH_DATABASE = process.env.COUCH_DATABASE;
}

// if we have a specified buffer size
if (typeof process.env.COUCH_BUFFER_SIZE !== 'undefined') {
  theconfig.COUCH_BUFFER_SIZE = parseInt(process.env.COUCH_BUFFER_SIZE);
}

// if we have a specified parallelism
if (typeof process.env.COUCH_PARALLELISM !== 'undefined') {
  theconfig.COUCH_PARALLELISM = parseInt(process.env.COUCH_PARALLELISM);
}

// if we have a specified log file
if (typeof process.env.COUCH_LOG !== 'undefined') {
  theconfig.COUCH_LOG = path.normalize(process.env.COUCH_LOG);
}

// if we are instructed to resume
if (typeof process.env.COUCH_RESUME !== 'undefined' && process.env.COUCH_RESUME === 'true') {
  theconfig.COUCH_RESUME = true;
}

// if we are given an output filename
if (typeof process.env.COUCH_OUTPUT !== 'undefined') {
  theconfig.COUCH_OUTPUT = path.normalize(process.env.COUCH_OUTPUT);
}

// override with command-line parameters
if (argv.url) {
  theconfig.COUCH_URL = argv.url;
}
if (argv.db) {
  theconfig.COUCH_DATABASE = argv.db;
}
if (argv.buffer) {
  theconfig.COUCH_BUFFER_SIZE = parseInt(argv.buffer);
}
if (argv.parallelism) {
  theconfig.COUCH_PARALLELISM = parseInt(argv.parallelism);
}
if (argv.log) {
  theconfig.COUCH_LOG = path.normalize(argv.log);
}
if (argv.resume && argv.resume === 'true') {
  theconfig.COUCH_RESUME = true;
}
if (argv.output) {
  theconfig.COUCH_OUTPUT = path.normalize(argv.output);
}

// we need a log file of some sort, so make up a temporary filename
if (!theconfig.COUCH_LOG) {
  var tmp = require('tmp');
  var tmpfile = tmp.fileSync();
  theconfig.COUCH_LOG = tmpfile.name;
}

console.error('******************');
console.error(' COUCHBACKUP/RESTORE - configuration')
console.error('  ', JSON.stringify(theconfig, null, ' ').replace(/\/\/.+@/g, '//****:****@'));
console.error('******************')

module.exports = theconfig;
