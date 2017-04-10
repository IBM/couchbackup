
var backup = require('./includes/backup.js'),
  restore = require('./includes/restore.js'),
  debug = require('debug')('couchbackup'),
  defaults = require('./includes/defaults.js').get(),
  fs = require('fs');

var mergeDefaults = function(opts, defaults) {
  for(i in defaults) {
    if (!opts[i]) {
      opts[i] = defaults[i];
    }
  }
  return opts;
}

module.exports = {
  backupStream: function(writeStream, opts, callback) {
    opts = mergeDefaults(opts, defaults);
    if (opts.COUCH_MODE === 'shallow') {
      backup = require('./includes/shallowbackup.js');
    }
    return backup(opts.COUCH_URL, opts.COUCH_DATABASE, opts.COUCH_BUFFER_SIZE, opts.COUCH_PARALLELISM, opts.COUCH_LOG, opts.COUCH_RESUME, opts.OUTPUT)
      .on('written', function(obj) {
        debug(' backed up batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
        writeStream.write(JSON.stringify(obj.data) + '\n');
      })
      .on('writeerror', function(obj) {
        debug('Error' + JSON.stringify(obj));
      })
      .on('writecomplete', function(obj) {
        debug('Backup complete - written' + JSON.stringify(obj));
        callback(null,obj);
      });
    
  },
  restoreStream: function(readStream, opts, callback) {
    opts = mergeDefaults(opts, defaults);
    return restore(opts.COUCH_URL, opts.COUCH_DATABASE, opts.COUCH_BUFFER_SIZE, opts.COUCH_PARALLELISM, readStream)
      .on('written', function(obj) {
        debug(' written ', obj.total);
      })
      .on('writeerror', function(e) {
        debug(' error', e);
      })
      .on('writecomplete', function(obj) {
        debug('restore complete');
        callback(null, obj);
      });
  },
  backupFile:  function(filename, opts, callback) {
    return this.backupStream(fs.createWriteStream(filename), opts, callback);
  },
  restoreFile: function(filename, opts, callback) {
    return this.restoreStream(fs.createReadStream(filename), opts, callback);
  }
}