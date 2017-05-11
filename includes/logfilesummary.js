'use strict';

const fs = require('fs');
const stream = require('stream');
const liner = require('./liner.js');

var onLine = function(onCommand, getDocs) {
  var change = new stream.Transform({objectMode: true});

  change._transform = function(line, encoding, done) {
    if (line && line[0] === ':') {
      var obj = {
        command: null,
        batch: null,
        docs: []
      };

      var matches;

      // extract command
      matches = line.match(/^:([a-z_]+) ?/);
      if (matches) {
        obj.command = matches[1];
      }

      // extract batch
      matches = line.match(/ batch([0-9]+)/);
      if (matches) {
        obj.batch = parseInt(matches[1]);
      }

      // extract doc ids
      if (getDocs && obj.command === 't') {
        var json = line.replace(/^.* batch[0-9]+ /, '').trim();
        obj.docs = JSON.parse(json);
      }
      onCommand(obj);
    }
    done();
  };
  return change;
};

/**
 * Generate a list of remaining batches from a download file.
 *
 * @param {string} log - log file name
 * @param {function} callback - callback with err, {changesComplete: N, batches: N}.
 *  changesComplete signifies whether the log file appeared to
 *  have completed reading the changes feed (contains :changes_complete).
 *  batches are remaining batch IDs for download.
 */
module.exports = function(log, callback) {
  // our sense of state
  var state = {

  };
  var changesComplete = false;

  // called with each line from the log file
  var onCommand = function(obj) {
    if (obj.command === 't') {
      state[obj.batch] = true;
    } else if (obj.command === 'd') {
      delete state[obj.batch];
    } else if (obj.command === 'changes_complete') {
      changesComplete = true;
    }
  };

  // stream through the previous log file
  fs.createReadStream(log)
    .pipe(liner())
    .pipe(onLine(onCommand, false))
    .on('finish', function() {
      var obj = {changesComplete: changesComplete, batches: state};
      callback(null, obj);
    });
};
