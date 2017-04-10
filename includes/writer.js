var async = require('async'),
    request = require('request'),
    stream = require('stream');

module.exports = function(couch_url, couch_database, buffer_size, parallelism) {
  
  var buffer = [ ],
    written = 0,
    linenumber = 0;

  // process the writes in bulk as a queue
  var q = async.queue(function(payload, cb) {
   // if we are restoring known revisions, we need to supply new_edits=false
   if (payload.docs && payload.docs[0] && payload.docs[0]._rev)  {
     payload.new_edits = false;
   }
   var r = {
     url: couch_url + '/' + couch_database + '/_bulk_docs',
     method: 'post',
     json: true,
     body: payload
   };

    request(r, function(err, res, data) {
      if (err) {
        writer.emit('writeerror', err);
      } else {
        written += payload.docs.length;
        writer.emit('written', { documents: payload.docs.length, total: written});
      }
      cb();
    });
  }, parallelism);
  
  
  // write the contents of the buffer to CouchDB in blocks of 500
  var processBuffer = function(flush, callback) {
  
    if(flush || buffer.length>= buffer_size) {
      var toSend = buffer.splice(0, buffer.length);
      buffer = [];
      q.push({docs: toSend});
      
      // wait until the buffer size falls to a reasonable level
      async.until(
        
        // wait until the queue length drops to twice the paralellism 
        // or until empty
        function() {
          if(flush) {
            return q.idle() && q.length() ==0
          } else {
            return q.length() <= parallelism * 2
          }
        },
        
        function(cb) {
          setTimeout(cb,100);
        },
        
        function() {
          if (flush) {
            writer.emit('writecomplete', { total: written });
          }
          callback();
        });


    } else {
      callback();
    }
  }

  var writer = new stream.Transform( { objectMode: true } );

  // take an object
  writer._transform = function (obj, encoding, done) {
    
    
    linenumber++;
    var arr = [];
    try {
      arr = JSON.parse(obj);
    } catch(e) {
      console.error('ERROR on line', linenumber, ': cannot parse as JSON');
    }
    if (typeof arr === 'object' && arr.length > 0) {
     
      for (var i in arr) {
        buffer.push(arr[i]);
      }
      
      // optionally write to the buffer
      this.pause();
      processBuffer(false,  function() {
        done();
      });
      
    } else {
      console.error('ERROR on line', linenumber, ': not an array');
      done();    
    }

  };

  // called when we need to flush everything
  writer._flush = function(done) {
    processBuffer(true, function() {
      done();
    });
  };
  
  return writer;
};


