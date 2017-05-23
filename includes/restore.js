'use strict';

const request = require('./request.js');
const debug = require('debug')('couchbackup');

module.exports = function(dbUrl, buffersize, parallelism, readstream, callback) {
  exists(dbUrl, function(err, exists) {
    if (err || !exists) {
      var e = new Error(`Database ${dbUrl} does not exist. ` +
        'Create the target database before restoring.');
      e.name = 'RestoreDatabaseNotFound';
      callback(e, null);
    }

    debug(`Starting restore to ${dbUrl}`);

    var liner = require('../includes/liner.js');
    var writer = require('../includes/writer.js')(dbUrl, buffersize, parallelism);

    // pipe the input to the output, via transformation functions
    readstream.pipe(liner())        // transform the input stream into per-line
      .pipe(writer); // transform the data

    callback(null, writer);
  });
};

/*
  Check couchDbUrl is a valid database URL.
  @param {string} couchDbUrl - Database URL
  @param {function(err, exists)} callback - exists is true if database exists
*/
function exists(dbUrl, callback) {
  var r = {
    url: dbUrl,
    method: 'HEAD'
  };
  const client = request.client(dbUrl, 1);
  client(r, function(err, res) {
    if (err) {
      debug(err);
      callback(err, false);
      return;
    }
    if (res && res.statusCode !== 200) {
      callback(null, false);
    }
    callback(null, true);
  });
}
