var fs = require('fs'),
  change = require('./change.js'),
  stream = require('stream'),
  liner = require('./liner.js');

var onLine = function(onCommand) {
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
      if (obj.command === 't') {
        var json = line.replace(/^.* batch[0-9]+ /,'').trim();
        obj.docs = JSON.parse(json);
      }
      onCommand(obj);
    }
    done();
  }
  
  return change;
};

// look at a previous log file and find the last processed sequence number
module.exports =  function(log, resume, callback) {
 
  // our sense of state
  var state = {

  };
  var changesComplete = false;

  var lastSeq = 0;
  if (!log || !resume) {
    return callback(null, {changesComplete: false, unfinished: []});
  }

  // called with each line from the log file
  var onCommand = function(obj) {
    if (obj.command === 't') {
      state[obj.batch] = obj;
    } else if (obj.command === 'd') {
      delete state[obj.batch];
    } else if (obj.command === 'changes_complete') {
      changesComplete = true;
    }
  }

  // stream through the previous log file
  var rs = fs.createReadStream(log)
    .pipe(liner())
    .pipe(onLine(onCommand))
    .on('finish', function() {
      var obj = {changesComplete: changesComplete, unfinished: []};
      for(var i in state) {
        var s = state[i];
        delete s.command;
        obj.unfinished.push(s);
      };
      callback(null, obj);
    });
};