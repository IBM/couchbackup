var async = require('async'),
  events = require('events'),
  fs = require('fs'),
  liner = require('./liner.js'),
  change = require('./change.js'),
  resumeData = require('./resume.js'),
  request = require('request');



module.exports = function(url, dbname, blocksize, parallelism, log, resume, output) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  var ee = new events.EventEmitter(),
    start = new Date().getTime(),
    cloudant = require('cloudant')( url), 
    db = cloudant.db.use(dbname),
    batch = 0,
    total = 0;

  // read the last sequence number, if applicable
  resumeData(log, resume,  function(err, rd) {


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
        url: url.replace(/\/\/.+@/g, '//****:****@')
      };
      fs.appendFileSync(log, '# ' + JSON.stringify(obj) + '\n' );
    }

    // list of document ids to process
    var buffer = [];

    // queue to process the fetch requests in an orderly fashion using _bulk_get
    var q = async.queue(function(payload, done) {
      var output = [];
      var thisBatch = payload.batch;
      delete payload.batch;

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
          ee.emit('written', { length: output.length, time: t, total: total, data: output, batch: thisBatch, qlen: q.length()*blocksize + buffer.length});
          if (log) {
            fs.appendFile(log, ':d batch' + thisBatch + '\n' , done);
          } else {
            done();
          }
        } else {
          ee.emit('writeerror', err);
          done();
        }
      });

    }, parallelism);

    // resume any unfinished batches
    if (resume && !rd.changesComplete) {
      console.error('WARNING: couchbackup did not receive the full changes feed. You may need to run again to get the full data set');
    }
    if (resume && rd.unfinished.length > 0) {
      console.error('resuming',rd.unfinished.length, 'batches');
      for(var i in rd.unfinished) {
        q.push(rd.unfinished[i]);
      }
    }

    // send documents ids to the queue in batches of 500 + the last batch
    var processBuffer = function(lastOne) {
      if (buffer.length >= blocksize || lastOne) {
        var n = blocksize;
        if (lastOne) {
          n = buffer.length;
        }
        var b = { docs: buffer.splice(0, blocksize), batch: batch };
        if (log) {
          fs.appendFileSync(log, ':t batch' + batch + ' ' + JSON.stringify(b.docs) + '\n');
        }
        batch++;
        q.push(b);
      }
    };

    // called once per received change
    var onChange = function(c) {
      if (c) {
        if (c.error) {
          ee.emit('writeerror', c);
          done();
        } else if (c.changes) {
          var obj = {id: c.id};
          buffer.push(obj);
          processBuffer(false);
        }
      }
    };

    // stream the changes feed
    if (!resume) {
     request(url + '/' + encodeURIComponent(dbname) + '/_changes?seq_interval=10000')
      .pipe(liner())
      .pipe(change(onChange))
      .on('finish', function() {
        processBuffer(true);
        if (log) {
          fs.appendFileSync(log, ':changes_complete\n');
        }
        q.drain = function() {       
          ee.emit('writecomplete', { total: total});
        };
      });;
    } else {
      q.drain = function() {       
        ee.emit('writecomplete', { total: total});
      };
    }

  });

  
  
  return ee;
};
