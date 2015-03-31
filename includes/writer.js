var stream = require('stream'),
  cloudant = require('./cloudant.js'),
  linenumber = 0;
  written = 0;

var writer = new stream.Transform( { objectMode: true } );

// take an object
writer._transform = function (obj, encoding, done) {
    
  linenumber++;
  var arr = [];
  try {
    arr = JSON.parse(obj);
  } catch(e) {
    console.error("ERROR on line",linenumber,": cannot parse as JSON");
  }
  if(typeof arr == "object" && arr.length>0) {
    written += arr.length;
    process.stderr.write(" restored docs: "+written+"\r");
    cloudant.bulk_write(arr, done);
  } else {
    console.error("ERROR on line",linenumber,": not an array");
    done();    
  }

};

module.exports = writer;