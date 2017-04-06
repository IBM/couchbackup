var request = require('request'),
  fs = require('fs'),
  liner = require('./liner.js'),
  change = require('./change.js');

module.exports = function(url, dbname, log, resume, blocksize, callback) {
  
  // do nothing if in resume mode
  if (resume) {
    return callback(null, {});
  }

  // list of document ids to process
  var buffer = [];
  var batch = 0;
  var doccount = 0;
  var last_seq = null;
  var log_stream = fs.createWriteStream(log);
  console.error('Streaming changes to disk:');

  // send documents ids to the queue in batches of 500 + the last batch
  var processBuffer = function(lastOne) {
    if (buffer.length >= blocksize || lastOne) {
      var n = blocksize;
      if (lastOne) {
        n = buffer.length;
      }
      var b = { docs: buffer.splice(0, blocksize), batch: batch };
      log_stream.write(':t batch' + batch + ' ' + JSON.stringify(b.docs) + '\n')
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
        last_seq = c.last_seq;
      }
    }
  };

  // stream the changes feed to disk
  request(url + '/' + encodeURIComponent(dbname) + '/_changes?seq_interval=10000')
    .pipe(liner())
    .pipe(change(onChange))
    .on('finish', function() {
      processBuffer(true);
      log_stream.write(':changes_complete ' + last_seq + '\n');
      log_stream.end();
      console.error('');
      if (doccount === 0) {
        callback('zero documents found - nothing to do', null);
      } else {
        callback(null, {batches: batch, docs: doccount});
      }
    });;
};