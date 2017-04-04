var async = require('async'),
  events = require('events'),
  fs = require('fs'),
  liner = require('./liner.js'),
  change = require('./change.js'),
  lastseq = require('./lastseq.js'),
  request = require('request');



module.exports = function(url, dbname, blocksize, parallelism, log, resume) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  var ee = new events.EventEmitter(),
    start = new Date().getTime(),
    cloudant = require('cloudant')( url), 
    db = cloudant.db.use(dbname),
    total = 0;

  lastseq(log, resume,  function(err, lastSeq) {

    // logging, clear the file
    if (log) {
      if (!resume && fs.existsSync(log)) {
        fs.unlinkSync(log);
      }
      var obj = {
        start: new Date().toISOString(),
        dbname: dbname, 
        blocksize: blocksize,
        parallelism: parallelism,
        log: log,
        url: url.replace(/\/\/.+@/g, '//****:****@'),
        startSeq: lastSeq
      };
      fs.appendFileSync(log, JSON.stringify(obj) + '\n' );
    }

    // list of document ids to process
    var buffer = [];

    // queue to process the fetch requests in an orderly fashion using _bulk_get
    var q = async.queue(function(payload, done) {
      var output = [];
      var lastSeq = null;
      payload.docs.map(function(obj) {
        if (obj.seq) {
          lastSeq = obj.seq;
          delete obj.seq;
        }
        return obj;
      });

      // do the /db/_bulk_get request
      db.bulk_get(payload, function(err, data) {
        if (!err) {

          // create an output array with the docs returned
          data.results.forEach(function(d) {
            if (d.docs) {
              d.docs.forEach(function(doc) {
                if (doc.ok) {
                  output.push(doc.ok);
                }
              });
            }
          });
          total += output.length;
          var t = (new Date().getTime() - start)/1000;
          ee.emit('written', { length: output.length, time: t, total: total, data: output, qlen: q.length()*blocksize + buffer.length});
        } else {
          ee.emit('writeerror', err);
        }
        if (log) {
          var obj = {
            time: t,
            now: new Date().toISOString(),
            total: total,
            qlen: q.length()*blocksize + buffer.length
          };
          if (lastSeq) {
            obj.seq = lastSeq;
          }
          fs.appendFile(log, JSON.stringify(obj) + '\n', done);
          lastSeq = null;
        } else {
          done();
        }
      })

    }, parallelism);

    // send documents ids to the queue in batches of 500 + the last batch
    var processBuffer = function(lastOne) {
      if (buffer.length >= blocksize || lastOne) {
        var n = blocksize;
        if (lastOne) {
          n = buffer.length;
        }
        var batch = { docs: buffer.splice(0, blocksize) };
        q.push(batch)
      }
    };

    // called once per received change
    var onChange = function(c) {
      if (c) {
        if (c.error) {
          ee.emit('writeerror', c);
        } else if (c.changes) {
          var obj = {id: c.id}
          if (c.seq) {
            obj.seq = c.seq;
          }
          buffer.push(obj);
          processBuffer(false);
        }
      }
    };

    // stream the changes feed
     request(url + '/' + encodeURIComponent(dbname) + '/_changes?seq_interval=10000&since=' + lastSeq)
      .pipe(liner())
      .pipe(change(onChange))
      .on('finish', function() {
        processBuffer(true);
        q.drain = function() {       
          ee.emit('writecomplete', { total: total});
        };
      });;
  });

  
  
  return ee;
};
