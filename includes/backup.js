var async = require('async');

module.exports = function(url, dbname, blocksize) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  var events = require('events'),
  ee = new events.EventEmitter(),
  cloudant = require('cloudant')( url), 
  db = cloudant.db.use(dbname),
  startdocid=null,
  total = 0;
 
  async.doUntil(function(callback){

    var opts = { limit: blocksize+1, include_docs:true };
    if (startdocid) {
      opts.startkey_docid = startdocid;
    }
    db.list(opts, function(err, data) {
    
      if (err) {
        ee.emit("writeerror", err);
        return callback(null,null)
      }

      if (data.rows.length === blocksize+1) {
        startdocid = data.rows[blocksize].id
      } else {
        startdocid = null
      }
    
      var docs = [];
      for (var i=0; i<Math.min(data.rows.length, blocksize); i++) {
        delete data.rows[i].doc._rev
        docs.push(data.rows[i].doc);
      }
    
      total += docs.length;
      ee.emit("written", { length: docs.length, total: total, data: docs});
      callback(null);
    })
  },
  function() {
    return (startdocid == null);
  }, 
  function(err){
    ee.emit("writecomplete", { total: total, err: err});
  });
  
  return ee;
};
