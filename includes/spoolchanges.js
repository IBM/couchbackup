const request = require('request');
const fs = require('fs');
const liner = require('./liner.js');
const change = require('./change.js');

module.exports = function(url, dbname, log, resume, blocksize, callback) {
  // do nothing if in resume mode
  if (resume) {
    return callback(null, {});
  }

  // list of document ids to process
  var buffer = [];
  var batch = 0;
  var doccount = 0;
  var lastSeq = null;
  var logStream = fs.createWriteStream(log);
  console.error('Streaming changes to disk:');

  // send documents ids to the queue in batches of 500 + the last batch
  var processBuffer = function(lastOne) {
    if (buffer.length >= blocksize || lastOne) {
      var n = blocksize;
      if (lastOne) {
        n = buffer.length;
      }
      var b = { docs: buffer.splice(0, blocksize), batch: batch };
      logStream.write(':t batch' + batch + ' ' + JSON.stringify(b.docs) + '\n');
      process.stderr.write('\r batch ' + batch);
      batch++;
    }
  };

  // called once per received change
  var onChange = function(c) {
    if (c) {
      if (c.error) {
        console.error('error', c);
      } else if (c.changes) {
        var obj = {id: c.id};
        doccount++;
        buffer.push(obj);
        processBuffer(false);
      } else if (c.last_seq) {
        lastSeq = c.last_seq;
      }
    }
  };

  // stream the changes feed to disk
  request(url + '/' + encodeURIComponent(dbname) + '/_changes?seq_interval=10000')
    .pipe(liner())
    .pipe(change(onChange))
    .on('finish', function() {
      processBuffer(true);
      logStream.write(':changes_complete ' + lastSeq + '\n');
      logStream.end();
      console.error('');
      if (doccount === 0) {
        callback(new Error('zero documents found - nothing to do'), null);
      } else {
        callback(null, {batches: batch, docs: doccount});
      }
    });
};
