// stolen from http://strongloop.com/strongblog/practical-examples-of-the-new-node-js-streams-api/
var stream = require('stream');

 
module.exports = function(onChange) {
  
  var change = new stream.Transform( { objectMode: true } );
 
  change._transform = function (line, encoding, done) {
    var obj = null;

    // one change per line - remove the trailing comma
    line = line.trim().replace(/,$/,'');

    // extract thee last_seq at the end of the changes feed
    if (line.match(/^"last_seq":/)) {
      line = '{' + line;
    }
    try {
      obj = JSON.parse(line);
    } catch(e) {
    }
    onChange(obj);
    done();
  }
  
  return change;
}