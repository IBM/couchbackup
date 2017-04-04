var fs = require('fs'),
  change = require('./change.js'),
  liner = require('./liner.js');

// look at a previous log file and find the last processed sequence number
module.exports =  function(log, resume, callback) {

  var lastSeq = 0;
  if (!log || !resume) {
    return callback(null, lastSeq);
  }

  // called with each line from the log file
  var onObj = function(obj) {
    if (obj.seq) {
      lastSeq = obj.seq;
    }
  }

  // stream through the previous log file
  var rs = fs.createReadStream(log)
    .pipe(liner())
    .pipe(change(onObj))
    .on('finish', function() {
      callback(null, lastSeq);
    });;
};