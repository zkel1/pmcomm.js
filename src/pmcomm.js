var __pmcomm__ = (function() {
'use strict';

var SENDER = '__PMS__';
var RECEIVER = '__PMR__';

function isFunc(param) {
  var getType = {};
  return param && getType.toString.call(param) === '[object Function]';
}

function parseArgs(args) {
  var res = [];
  for (var i=0; i<args.length; ++i) {
      res.push(args[i]);
  }
  return res;
}

function Sender(otherWindow, targetOrigin, targetObject, methods) {
  this._window = otherWindow;
  this._origin = targetOrigin;
  this._obj = targetObject;
  this._msgs = {};
  var sender = this;

  window.addEventListener("message", function (e) {
    sender._onMsg(e);
  }, false);

  // Create a proxy stub
  methods.forEach(function(method) {
      sender.__proto__[method] = function() {
        return sender._invoke(method, parseArgs(arguments));
      }
  });
}

Sender.prototype._onMsg = function(e) {

  if (e.data && e.data.type && e.data.type===RECEIVER && e.data.id && e.data.id in this._msgs) {
    var msg = this._msgs[e.data.id];
    if (e.data.result || e.data.error) {
      if (e.data.error) {
        msg.reject(e.data.id+' '+JSON.parse(e.data.error));
      } else {
        msg.resolve(JSON.parse(e.data.result));
      }
      msg.resolve = msg.reject = null;
    } else if ('cbIdx' in e.data) {
      var idx = e.data.cbIdx;
      var callback = msg.callbacks[idx];
      var callback_data = JSON.parse(e.data.callback_data);
      try {
        callback.apply(callback, callback_data);
      }
      catch (err) {
        console.error(e.data.id, err);
      }
    }

    // Delete message handler if it is no longer necessary
    if (Object.keys(msg.callbacks).length===0 && msg.result===null) {
      delete this._msgs[e.data.id];
    }

  }
}

Sender.prototype._postMsg = function(msgId, method, params, cbIdxs) {
  if (typeof params === 'undefined') {
    params = [];
  }
  var send = {
    obj: this._obj,
    method: method,
    params: JSON.stringify(params),
    cbIdxs: cbIdxs
  };
  return this._window.postMessage({
    type: SENDER,
    id: msgId,
    send: send
  }, '*');
}

Sender.prototype._invoke = function(method, params) {
  var msgId = ""+(new Date().getTime()+Math.random());
  var _this = this;
  return new Promise(function(resolve, reject) {
    var msg = {
      start: new Date().getTime(),
      resolve: resolve,
      reject: reject,
      callbacks: {}
    };

    var cbIdxs = [];
    params.forEach(function(param, idx) {
      if (isFunc(param)) {
        msg.callbacks[idx] = param;
        params[idx] = undefined;
        cbIdxs.push(idx);
      }
    });

    _this._msgs[msgId] = msg;
    _this._postMsg(msgId, method, params, cbIdxs);
  });
}

function Receiver(objectName, methods) {
  var callback_handler = function(id, resSource, resOrigin, cbIdx) {
    return function() {
      var msg = {
        id: id,
        cbIdx: cbIdx,
        callback_data: JSON.stringify(parseArgs(arguments)),
        type: RECEIVER
      };
      resSource.postMessage(msg, resOrigin);
    }
  }
  window.addEventListener('message', function(e) {
    if (e.data.type===SENDER && e.data.id && e.data.send && e.data.send.obj===objectName) {
      var send = e.data.send;
      var obj = eval(send.obj);
      var method = eval(send.obj+'.'+send.method);
      var res = null;
      var params = JSON.parse(send.params);
      send.cbIdxs.forEach(function(cbIdx) {
        params[cbIdx] = callback_handler(e.data.id, e.source, e.origin, cbIdx);
      });
      try {
        console.log(methods,  methods instanceof RegExp, methods instanceof Set, send.method);
        if (methods && (
            methods instanceof RegExp && !methods.test(send.method) 
            || methods instanceof Set && !methods.has(send.method))) {
          throw "Unsupported method: "+send.method;
        }
        res = method.apply(obj, params);
        var msg = {
          id: e.data.id,
          result: JSON.stringify(res),
          type: RECEIVER
        };
      }
      catch (err) {
        console.error(e.data.id, err);
        var msg = {
          id: e.data.id,
          error: JSON.stringify(err.toString()),
          type: RECEIVER
        };
      }
      e.source.postMessage(msg, e.origin);
    }
  }, false);
}

return {
  Sender: Sender,
  Receiver: Receiver
};

})();

/**
  * Post messaging proxy object
  * @constructor
  * @param {Window} otherWindow - A reference to another window; such a reference may be obtained, for example, using the contentWindow property of an iframe element, the object returned by window.open, or by named or numeric index on Window.frames.
  * @param {string} targetOrigin - Specifies what the origin of otherWindow must be for the event to be dispatched, either as the literal string "*" (indicating no preference) or as a URI.
  * @param {string} targetObject - Name of the object in otherWindow to be proxied
  * @param {list} methods - Proxied methods of targetObject
  */
var PMCommSender = __pmcomm__.Sender;

/**
  * Create a proxy listener for object
  * @method
  * @param {String} objectName - Variable name of the object
  * @param {Set | RegExp | undefined} - A Set of method names allowed to be invoked for method or 
  * A RegExp that matches method names allowed to be invoked or if undefined, all methods can be invoked
  */
var PMCommReceiver = __pmcomm__.Receiver;
