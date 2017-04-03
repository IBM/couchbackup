var async = require('async'),
  events = require('events'),
  request = require('request');

module.exports = function(url, dbname, blocksize, parallelism) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  var ee = new events.EventEmitter(),
    start = new Date().getTime(),
    cloudant = require('cloudant')( url), 
    db = cloudant.db.use(dbname),
    total = 0;

  // list of document ids to process
  var buffer = [];

  // queue to process the fetch requests in an orderly fashion using _bulk_get
  var q = async.queue(function(payload, done) {
    var output = [];

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
        ee.emit('written', { length: output.length, time: t, total: total, data: output});
      } else {
        ee.emit('writeerror', err);
      }
      done();
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
        c.changes.forEach(function(r) {
          buffer.push({id: c.id});
        });
        processBuffer(false);
      }
    }
  };

  // stream the changes feed
  request(url + '/' + encodeURIComponent(dbname) + '/_changes')
    .pipe(require('./liner.js'))
    .pipe(require('./change.js')(onChange))
    .on('finish', function() {
      processBuffer(true);
      q.drain = function() {
        ee.emit('writecomplete', { total: total});
      };
    });;
  
  return ee;
};
