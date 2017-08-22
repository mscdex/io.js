// test the speed of .pipe() with sockets
'use strict';

var common = require('../common.js');
var PORT = common.PORT;

var bench = common.createBenchmark(main, {
  len: [102400, 1024 * 1024 * 16],
  type: ['utf', 'asc', 'buf'],
  recvbuf: [0, 16 * 1024],
  dur: [5]
});

var dur;
var len;
var type;
var chunk;
var encoding;
var recvbuf;
var received = 0;

function main(conf) {
  dur = +conf.dur;
  len = +conf.len;
  type = conf.type;
  var recvbufsize = +conf.recvbuf;
  if (isFinite(recvbufsize) && recvbufsize > 0)
    recvbuf = Buffer.alloc(recvbufsize);

  switch (type) {
    case 'buf':
      chunk = Buffer.alloc(len, 'x');
      break;
    case 'utf':
      encoding = 'utf8';
      chunk = 'ü'.repeat(len / 2);
      break;
    case 'asc':
      encoding = 'ascii';
      chunk = 'x'.repeat(len);
      break;
    default:
      throw new Error(`invalid type: ${type}`);
  }

  server();
}

var net = require('net');

function Writer() {
  this.writable = true;
}

Writer.prototype.write = function(chunk, encoding, cb) {
  received += chunk.length;

  if (typeof encoding === 'function')
    encoding();
  else if (typeof cb === 'function')
    cb();

  return true;
};

// doesn't matter, never emits anything.
Writer.prototype.on = function() {};
Writer.prototype.once = function() {};
Writer.prototype.emit = function() {};
Writer.prototype.prependListener = function() {};


function flow() {
  var dest = this.dest;
  var res = dest.write(chunk, encoding);
  if (!res)
    dest.once('drain', this.flow);
  else
    process.nextTick(this.flow);
}

function Reader() {
  this.flow = flow.bind(this);
  this.readable = true;
}

Reader.prototype.pipe = function(dest) {
  this.dest = dest;
  this.flow();
  return dest;
};


function server() {
  var reader = new Reader();
  var writer;
  var socketOpts;
  if (recvbuf === undefined) {
    writer = new Writer();
    socketOpts = { port: PORT };
  } else {
    socketOpts = {
      port: PORT,
      buffer: recvbuf,
      onread: function(nread, buf) {
        received += nread;
      }
    };
  }

  // the actual benchmark.
  var server = net.createServer(function(socket) {
    reader.pipe(socket);
  });

  server.listen(PORT, function() {
    var socket = net.connect(socketOpts);
    socket.on('connect', function() {
      bench.start();

      if (recvbuf === undefined)
        socket.pipe(writer);

      setTimeout(function() {
        var bytes = received;
        var gbits = (bytes * 8) / (1024 * 1024 * 1024);
        bench.end(gbits);
        process.exit(0);
      }, dur * 1000);
    });
  });
}
