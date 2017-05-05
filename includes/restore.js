const url = require('url');

const request = require('request');
const debug = require('debug')('couchbackup');

module.exports = function(url, dbname, buffersize, parallelism, readstream, callback) {
  const couchDbUrl = databaseUrl(url, dbname);

  exists(couchDbUrl, function(err, exists) {
    if (err || !exists) {
      var e = new Error(`Database ${couchDbUrl} does not exist. ` +
        'Create the target database before restoring.');
      e.name = 'RestoreDatabaseNotFound';
      callback(e, null);
    }

    debug(`Starting restore to ${couchDbUrl}`);

    var liner = require('../includes/liner.js');
    var writer = require('../includes/writer.js')(couchDbUrl, buffersize, parallelism);

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
function exists(couchDbUrl, callback) {
  var r = {
    url: couchDbUrl,
    method: 'HEAD',
    json: true
  };
  request(r, function(err, res) {
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

/*
  Combine a base URL and a database name, ensuring at least single slash
  between root and database name. This allows users to have Couch behind
  proxies that mount Couch's / endpoint at some other mount point.
  @param {string} root - root URL
  @param {string} databaseName - database name
  @return concatenated URL.
*/
function databaseUrl(root, databaseName) {
  if (!root.endsWith('/')) {
    root = root + '/';
  }
  return url.resolve(root, databaseName);
}
