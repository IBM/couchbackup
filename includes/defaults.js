'use strict';

var tmp = require('tmp');

var get = function() {
  var tmpfile = tmp.fileSync();
  var defaults = {
    parallelism: 5,
    bufferSize: 500,
    log: tmpfile.name,
    resume: false,
    mode: 'full'
  };

  return defaults;
};

var legacyDefaults = function() {
  var defaults = {
    COUCH_URL: 'http://localhost:5984',
    COUCH_DATABASE: 'test'
  };

  return defaults;
};

module.exports = {
  legacyDefaults: legacyDefaults,
  get: get
};
