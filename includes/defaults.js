var tmp = require('tmp');

var get = function() {
  var tmpfile = tmp.fileSync();
  var defaults = {
    COUCH_URL: 'http://localhost:5984',
    COUCH_DATABASE: 'test',
    COUCH_PARALLELISM: 5,
    COUCH_BUFFER_SIZE: 500,
    COUCH_LOG: tmpfile.name,
    COUCH_RESUME: false,
    COUCH_OUTPUT: null,
    COUCH_MODE: 'full'
  };

  return defaults;
};

module.exports = {
  get: get
};