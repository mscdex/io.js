'use strict';

const common = require('../common');
const assert = require('assert');
const crypto = require('crypto');
const dgram = require('dgram');
const dns = require('dns');
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const zlib = require('zlib');
const ChildProcess = require('child_process').ChildProcess;
const StreamWrap = require('_stream_wrap').StreamWrap;
const async_wrap = process.binding('async_wrap');
const NSSReqWrap = process.binding('nss_wrap').NSSReqWrap;
const pkeys = Object.keys(async_wrap.Providers);

let keyList = pkeys.slice();
// Drop NONE
keyList.splice(0, 1);

function init(id) {
  keyList = keyList.filter(e => e != pkeys[id]);
}

function noop() { }

async_wrap.setupHooks(init, noop, noop);

async_wrap.enable();


setTimeout(function() { });

fs.stat(__filename, noop);
fs.watchFile(__filename, noop);
fs.unwatchFile(__filename);
fs.watch(__filename).close();

dns.lookup('localhost', noop);
dns.lookupService('::', 0, noop);
dns.resolve('localhost', noop);

new StreamWrap(new net.Socket());

new (process.binding('tty_wrap').TTY)();

crypto.randomBytes(1, noop);

common.refreshTmpDir();

net.createServer(function(c) {
  c.end();
  this.close();
}).listen(common.PIPE, function() {
  net.connect(common.PIPE, noop);
});

net.createServer(function(c) {
  c.end();
  this.close(checkTLS);
}).listen(common.PORT, function() {
  net.connect(common.PORT, noop);
});

dgram.createSocket('udp4').bind(common.PORT, function() {
  this.send(new Buffer(2), 0, 2, common.PORT, '::', () => {
    this.close();
  });
});

process.on('SIGINT', () => process.exit());

// Run from closed net server above.
function checkTLS() {
  const options = {
    key: fs.readFileSync(common.fixturesDir + '/keys/ec-key.pem'),
    cert: fs.readFileSync(common.fixturesDir + '/keys/ec-cert.pem')
  };
  const server = tls.createServer(options, noop)
    .listen(common.PORT, function() {
      tls.connect(common.PORT, { rejectUnauthorized: false }, function() {
        this.destroy();
        server.close();
      });
    });
}

zlib.createGzip();

new ChildProcess();

if (common.isWindows || process.oldDNS)
  keyList.splice(keyList.indexOf('NSSREQWRAP'), 1);

if (!process.oldDNS) {
  const unused = ['GETADDRINFOREQWRAP', 'GETNAMEINFOREQWRAP', 'QUERYWRAP'];
  keyList = keyList.filter(function(k) { return unused.indexOf(k) === -1; });

  if (!common.isWindows)
    new NSSReqWrap('foobarbazhostname', -1);
}

process.on('exit', function() {
  if (keyList.length !== 0) {
    process._rawDebug('Not all keys have been used:');
    process._rawDebug(keyList);
    assert.equal(keyList.length, 0);
  }
});
