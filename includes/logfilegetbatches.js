
var fs = require('fs'),
  stream = require('stream'),
  liner = require('./liner.js');

var onLine = function(onCommand, batches) {
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

      // if this is one we want
      if (obj.command === 't' && batches.indexOf(obj.batch) > -1) {
        var json = line.replace(/^.* batch[0-9]+ /,'').trim();
        obj.docs = JSON.parse(json);
        onCommand(obj);    
      }
    }
    done();
  }
  
  return change;
};

module.exports = function(log, batches, callback) {

  // our sense of state
  var retval = { };

  // called with each line from the log file
  var onCommand = function(obj) {
    retval[obj.batch] = obj;
  }

  // stream through the previous log file
  var rs = fs.createReadStream(log)
    .pipe(liner())
    .pipe(onLine(onCommand, batches))
    .on('finish', function() {
      callback(null, retval);
    });
};
