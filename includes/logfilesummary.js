
var fs = require('fs'),
  stream = require('stream'),
  liner = require('./liner.js');

var onLine = function(onCommand, getDocs) {
  var change = new stream.Transform( { objectMode: true } );
 
  change._transform = function (line, encoding, done) {

    if (line && line[0] === ':') {
      var obj = {
        command: null,
        batch: null,
        docs: []
      };

      // extract command
      var matches = line.match(/^:([a-z_]+) ?/);
      if (matches) {
        obj.command = matches[1];
      }

      // extract batch
      var matches = line.match(/ batch([0-9]+)/);
      if (matches) {
        obj.batch = parseInt(matches[1]);
      }

      // extract doc ids
      if (getDocs && obj.command === 't') {
        var json = line.replace(/^.* batch[0-9]+ /,'').trim();
        obj.docs = JSON.parse(json);
      }
      onCommand(obj);
    }
    done();
  }
  
  return change;
};

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
  }

  // stream through the previous log file
  var rs = fs.createReadStream(log)
    .pipe(liner())
    .pipe(onLine(onCommand, false))
    .on('finish', function() {
      var obj = {changesComplete: changesComplete, batches: state};
      callback(null, obj);
    });
};
