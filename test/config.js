
var assert = require('assert');
var argvstub = process.argv.slice(0,2);
var clone = function(x) {
  return JSON.parse(JSON.stringify(x));
};

describe('Default parameters', function() {
  
  afterEach(function() {
    delete require.cache[require.resolve('../includes/config.js')];
  });
  
  it('respects the COUCH_URL env variable', function(done) {
    process.env.COUCH_URL = 'http://x:y@myurl.com';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_URL, 'string');
    assert.equal(config.COUCH_URL, process.env.COUCH_URL);
    done();
  });

  it('respects the COUCH_DATABASE env variable', function(done) {
    process.env.COUCH_DATABASE = 'mydb';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_DATABASE, 'string');
    assert.equal(config.COUCH_DATABASE, process.env.COUCH_DATABASE);
    done();
  });

  it('respects the COUCH_BUFFER_SIZE env variable', function(done) {
    process.env.COUCH_BUFFER_SIZE = '1000';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_BUFFER_SIZE, 'number');
    assert.equal(config.COUCH_BUFFER_SIZE, 1000);
    done();
  });

  it('respects the COUCH_PARALLELISM env variable', function(done) {
    process.env.COUCH_PARALLELISM = '10';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_PARALLELISM, 'number');
    assert.equal(config.COUCH_PARALLELISM, 10);
    done();
  });

  it('respects the COUCH_LOG env variable', function(done) {
    process.env.COUCH_LOG = 'my.log';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_LOG, 'string');
    assert.equal(config.COUCH_LOG, process.env.COUCH_LOG);
    done();
  });

  it('respects the COUCH_RESUME env variable', function(done) {
    process.env.COUCH_RESUME = 'true';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_RESUME, 'boolean');
    assert.equal(config.COUCH_RESUME, true);
    done();
  });

  it('respects the COUCH_OUTPUT env variable', function(done) {
    process.env.COUCH_OUTPUT = 'myfile.txt';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_OUTPUT, 'string');
    assert.equal(config.COUCH_OUTPUT, process.env.COUCH_OUTPUT);
    done();
  });

  it('respects the COUCH_MODE env variable', function(done) {
    process.env.COUCH_MODE = 'shallow';
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_MODE, 'string');
    assert.equal(config.COUCH_MODE, 'shallow');
    done();
  });
 
  it('respects the --url command-line parameter', function(done) {
    process.argv = clone(argvstub);
    var url = 'https://a:b@myurl.com';
    process.argv.push('--url', url);
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_URL, 'string');
    assert.equal(config.COUCH_URL, url);
    done();
  });

  it('respects the --db command-line parameter', function(done) {
    process.argv = clone(argvstub);
    var db = 'mydb2';
    process.argv.push('--db', db);
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_DATABASE, 'string');
    assert.equal(config.COUCH_DATABASE, db);
    done();
  });

  it('respects the --buffer command-line parameter', function(done) {
    process.argv = clone(argvstub);
    process.argv.push('--buffer', '250');
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_BUFFER_SIZE, 'number');
    assert.equal(config.COUCH_BUFFER_SIZE, 250);
    done();
  });

  it('respects the --parallelism command-line parameter', function(done) {
    process.argv = clone(argvstub);
    process.argv.push('--parallelism', '6');
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_PARALLELISM, 'number');
    assert.equal(config.COUCH_PARALLELISM, 6);
    done();
  });

  it('respects the --log command-line parameter', function(done) {
    process.argv = clone(argvstub);
    var filename = 'my2.log';
    process.argv.push('--log', filename);
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_LOG, 'string');
    assert.equal(config.COUCH_LOG, filename);
    done();
  });

  it('respects the --output command-line parameter', function(done) {
    process.argv = clone(argvstub);
    var filename = 'myoutput2.txt';
    process.argv.push('--output', filename);
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_OUTPUT, 'string');
    assert.equal(config.COUCH_OUTPUT, filename);
    done();
  });

  it('respects the --shallow command-line parameter', function(done) {
    process.argv = clone(argvstub);
    process.argv.push('--mode', 'shallow');
    var config = require('../includes/config.js');
    assert.equal(typeof config.COUCH_MODE, 'string');
    assert.equal(config.COUCH_MODE, 'shallow');
    done();
  });
 
  
});