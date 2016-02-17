'use strict';

const binding = process.binding('util');
const prefix = `(${process.release.name}:${process.pid}) `;

exports.getHiddenValue = binding.getHiddenValue;
exports.setHiddenValue = binding.setHiddenValue;

// All the internal deprecations have to use this function only, as this will
// prepend the prefix to the actual message.
exports.deprecate = function(fn, msg) {
  return exports._deprecate(fn, `${prefix}${msg}`);
};

// All the internal deprecations have to use this function only, as this will
// prepend the prefix to the actual message.
exports.printDeprecationMessage = function(msg, warned) {
  return exports._printDeprecationMessage(`${prefix}${msg}`, warned);
};

exports.error = function(msg) {
  const fmt = `${prefix}${msg}`;
  if (arguments.length > 1) {
    const args = new Array(arguments.length);
    args[0] = fmt;
    for (let i = 1; i < arguments.length; ++i)
      args[i] = arguments[i];
    console.error.apply(console, args);
  } else {
    console.error(fmt);
  }
};

exports.trace = function(msg) {
  console.trace(`${prefix}${msg}`);
};

exports._printDeprecationMessage = function(msg, warned) {
  if (process.noDeprecation)
    return true;

  if (warned)
    return warned;

  if (process.throwDeprecation)
    throw new Error(msg);
  else if (process.traceDeprecation)
    console.trace(msg.startsWith(prefix) ? msg.replace(prefix, '') : msg);
  else
    console.error(msg);

  return true;
};

// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports._deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (global.process === undefined) {
    return function() {
      return exports._deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    warned = exports._printDeprecationMessage(msg, warned);
    return fn.apply(this, arguments);
  }

  return deprecated;
};

exports.decorateErrorStack = function decorateErrorStack(err) {
  if (!(exports.isError(err) && err.stack) ||
      exports.getHiddenValue(err, 'node:decorated') === true)
    return;

  const arrow = exports.getHiddenValue(err, 'node:arrowMessage');

  if (arrow) {
    err.stack = arrow + err.stack;
    exports.setHiddenValue(err, 'node:decorated', true);
  }
};

exports.isError = function isError(e) {
  return exports.objectToString(e) === '[object Error]' || e instanceof Error;
};

exports.objectToString = function objectToString(o) {
  return Object.prototype.toString.call(o);
};

exports.makeStringMatcher = function(strings, fnName, returnLowered) {
  if (!Array.isArray(strings) &&
      (typeof strings !== 'object' || strings === null)) {
    throw new Error('"strings" argument must be an array or an object');
  }

  if (typeof fnName !== 'string') {
    returnLowered = fnName;
    fnName = undefined;
  }

  var minLen = Infinity;
  var maxLen = -1;
  var replaces;

  // A tree-like object that stores paths to strings, character by character
  var paths = Object.create(null);

  if (!Array.isArray(strings)) {
    if (returnLowered) {
      // Allow an object that maps allowed inputs to desired return values
      // This is useful to normalize outputs
      // (e.g. { 'utf8': 'utf8', 'utf-8': 'utf8' })
      replaces = strings;
    }
    strings = Object.keys(strings);
  } else {
    strings = strings.slice();
  }

  strings.sort(function(a, b) {
    // Sort the allowed inputs by length first, then by normal string comparison
    a = ('' + a).toLowerCase();
    b = ('' + b).toLowerCase();
    if (a.length === b.length) {
      if (a < b)
        return -1;
      else if (a > b)
        return 1;
      else
        return 0;
    }
    return a.length - b.length;
  }).forEach(function(string) {
    // Populate our tree-like object, grouping strings by length
    // (e.g. for `strings` of ['utf8', 'ucs2'] this would look like:
    //  {
    //    4: {
    //      'u': {
    //        'c': {
    //          's': {
    //            '2': 'ucs2'
    //          }
    //        },
    //        't': {
    //          'f': {
    //            '8': 'utf8'
    //          }
    //        }
    //    }
    //  })
    string = ('' + string).toLowerCase();
    minLen = Math.min(string.length, minLen);
    maxLen = Math.max(string.length, maxLen);
    if (paths[string.length] === undefined)
      paths[string.length] = Object.create(null);
    var p = paths[string.length];
    for (var i = 0; i < string.length; ++i) {
      var chr = string[i];
      if (p[chr] === undefined) {
        if (i + 1 < string.length)
          p = p[chr] = Object.create(null);
        else
          p[chr] = (replaces ? replaces[string] : string);
      } else
        p = p[chr];
    }
  });

  var code = "'use strict';\n";

  if (maxLen > -1) {
    code += 'switch (input.length) {\n';
    var indent = '  ';
    Object.keys(paths).forEach(function(len) {
      len = +len;
      if (len === 0)
        return;
      code += indent + `case ${len}:\n`;
      if (len === 0) {
        // Zero length strings are a simple case that can be easily handled
        if (returnLowered)
          code += indent + "  return '';\n";
        else
          code += indent + '  return true;\n';
        return;
      }

      var p = paths[len];
      var depth = 0;
      var i;

      // Create a finite stack up front for tracking our traversal of the
      // `paths` tree object
      var stack = new Array(len);
      for (i = 0; i < len; ++i)
        stack[i] = { p: null, keys: null };

      indent += '  ';
      while (true) {
        stack[depth].p = p;
        var keys = stack[depth].keys;
        if (keys === null) {
          // We need to refresh our key list to start descending the current
          // path in the tree
          keys = stack[depth].keys = Object.keys(p);
          code += indent + `switch (input.charCodeAt(${depth})) {\n`;
        }
        if (keys.length === 0) {
          // There's nothing left to process at this node in the tree
          indent = indent.slice(0, -2);
          if (depth === 0) {
            // If we've reached the top of the stack and have no nodes left,
            // that means we are done with all strings of the current length
            break;
          }
          code += indent + '}\n';
          code += indent + 'break;\n';
          indent = indent.slice(0, -2);
          // Remove the current node from its parent, because it is currently
          // empty
          --depth;
          delete stack[depth].p[stack[depth].keys[0]];
          stack[depth].keys.shift();
          p = stack[depth].p;
          if (stack[depth].keys.length > 0)
            indent = indent.slice(0, -2);
          continue;
        }
        var chr = keys[0];
        var lowerCode = chr.charCodeAt(0);
        var upperCode = chr.toUpperCase().charCodeAt(0);
        indent += '  ';
        var commentChr = JSON.stringify(chr);
        code += indent + `case ${lowerCode}: // ${commentChr} \n`;
        if (lowerCode !== upperCode) {
          commentChr = JSON.stringify(chr.toUpperCase());
          code += indent + `case ${upperCode}: // ${commentChr} \n`;
        }
        if (depth + 1 === len) {
          // We're at a leaf node (the end of a string), this is where we can
          // return whatever type of output that was requested
          if (returnLowered)
            code += indent + `  return ${JSON.stringify(p[chr])};\n`;
          else
            code += indent + '  return true;\n';
          // Remove the current (leaf) node
          keys.shift();
          delete p[chr];
        } else {
          indent += '  ';
          p = p[chr];
          ++depth;
          // We're descending the tree another level, so make sure to force a
          // re-rendering of the keys at the current node in case we are
          // descending again after the first string
          stack[depth].keys = null;
        }
      }
      code += indent + '}\n';
      code += indent + 'break;\n';
      indent = indent.slice(0, -2);
    });
    code += '}\n';
  }
  code += `return ${returnLowered ? 'undefined' : 'false'};\n`;
  if (fnName)
    return (new Function(`return function ${fnName}(input) {\n${code}};`))();
  else
    return new Function('input', code);
};
