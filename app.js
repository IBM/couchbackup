
var backup = require('./includes/backup.js');
const restore = require('./includes/restore.js');
const debug = require('debug')('couchbackup');
const defaults = require('./includes/defaults.js').get();
const fs = require('fs');
const url = require('url');

var mergeDefaults = function(opts, defaults) {
  for (var i in defaults) {
    if (!opts[i]) {
      opts[i] = defaults[i];
    }
  }
  return opts;
};

module.exports = {
  backupStream: function(writeStream, opts, callback) {
    opts = mergeDefaults(opts, defaults);
    if (opts.COUCH_MODE === 'shallow') {
      backup = require('./includes/shallowbackup.js');
    }
    return backup(
      databaseUrl(opts.COUCH_URL, opts.COUCH_DATABASE),
      opts.COUCH_BUFFER_SIZE,
      opts.COUCH_PARALLELISM,
      opts.COUCH_LOG,
      opts.COUCH_RESUME,
      opts.OUTPUT
      ).on('written', function(obj) {
        debug(' backed up batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
        writeStream.write(JSON.stringify(obj.data) + '\n');
      })
      .on('writeerror', function(obj) {
        debug('Error' + JSON.stringify(obj));
      })
      .on('writecomplete', function(obj) {
        debug('Backup complete - written' + JSON.stringify(obj));
        callback(null, obj);
      });
  },
  restoreStream: function(readStream, opts, callback) {
    opts = mergeDefaults(opts, defaults);
    return restore(
      databaseUrl(opts.COUCH_URL, opts.COUCH_DATABASE),
      opts.COUCH_BUFFER_SIZE,
      opts.COUCH_PARALLELISM,
      readStream,
      function(err, writer) {
        if (err) {
          callback(err, null);
        }

        writer.on('written', function(obj) {
          debug(' written ', obj.total);
        })
        .on('writeerror', function(e) {
          debug(' error', e);
        })
        .on('writecomplete', function(obj) {
          debug('restore complete');
          callback(null, obj);
        });
      }
    );
  },
  backupFile: function(filename, opts, callback) {
    return this.backupStream(fs.createWriteStream(filename), opts, callback);
  },
  restoreFile: function(filename, opts, callback) {
    return this.restoreStream(fs.createReadStream(filename), opts, callback);
  }
};

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
  return url.resolve(root, encodeURIComponent(databaseName));
}
