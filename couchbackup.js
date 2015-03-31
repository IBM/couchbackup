var config = require('./includes/config.js'),
  nano = require('nano')( { url: config.COUCH_URL } ), 
  db = nano.db.use(config.COUCH_DATABASE),
  async = require('async'),
  blocksize = 500,
  startdocid=null,
  total = 0;


async.doUntil(function(callback){
  var opts = { limit: blocksize+1, include_docs:true };
  if (startdocid) {
    opts.startkey_docid = startdocid;
  }
  db.list(opts, function(err, data) {
    if(err) {
      return callback(err,null)
    }
    if(data.rows.length == blocksize+1) {
      startdocid = data.rows[blocksize].id
    } else {
      startdocid = null
    }
    
    var docs = [];
    for(var i=0;i<Math.min(data.rows.length, blocksize); i++) {
      docs.push(data.rows[i].doc);
    }
    
    total += docs.length;
    process.stderr.write(" backed up docs: "+total+"\r");
    console.log(JSON.stringify(docs));
    callback(null);
  })
},
function() {
  return (startdocid == null);
}, 
function(err){
  console.error("");
  console.error("Done");
});
