var __pmcomm__ = (function() {
'use strict';

var PMComm_SENDER = '__PMS__';
var PMComm_RECEIVER = '__PMR__';

function isFunction(param) {
  var getType = {};
  return param && getType.toString.call(param) === '[object Function]';
}

function PMCommResult() {
  this._success = null;
  this._error = null;
}

PMCommResult.prototype.success = function(success) {
  this._success = success;
  return this;
}

PMCommResult.prototype.error = function(error) {
  this._error = error;
  return this;
}

function parseArgs(args) {
  var res = [];
  for (var i=0; i<args.length; ++i) {
      res.push(args[i]);
  }
  return res;
}

function PMCommSender(otherWindow, targetOrigin, targetObject, methods) {
  this._window = otherWindow;
  this._origin = targetOrigin;
  this._obj = targetObject;
  this._msgs = {};
  var sender = this;

  window.addEventListener("message", function (e) {
    sender._onMsg(e);
  }, false);

  methods.forEach(function(method) {
      sender.__proto__[method] = function() {
        return sender._invoke(method, parseArgs(arguments));
      }
  });
}

PMCommSender.prototype._onMsg = function(e) {
  if (e.data && e.data.type && e.data.type===PMComm_RECEIVER && e.data.id && e.data.id in this._msgs) {
    var msg = this._msgs[e.data.id];
    if (msg.result_callback && (e.data.result || e.data.error)) {
      var result_callback = msg.result_callback;
      if (e.data.error) {
        if (result_callback._error) {
          result_callback._error(JSON.parse(e.data.error));
        }
      } else if (result_callback._success) {
        result_callback._success(JSON.parse(e.data.result));
      }
      msg.result_callback = null;
    } else if ('cbIdx' in e.data) {
      var idx = e.data.cbIdx;
      var callback = msg.callbacks[idx];
      var callback_data = JSON.parse(e.data.callback_data);
      try {
        callback.apply(callback, callback_data);
      }
      catch (err) {
        console.error(err);
      }
    }
    if (Object.keys(msg.callbacks).length===0 && msg.result===null) {
      delete this._msgs[e.data.id];
    }
  }
}

PMCommSender.prototype._postMsg = function(msgId, method, params, cbIdxs) {
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
    type: PMComm_SENDER,
    id: msgId,
    send: send
  }, '*');
}

PMCommSender.prototype._invoke = function(method, params) {
  var msgId = 'X'+Math.random()+new Date().getTime();
  var result_callback = new PMCommResult();
  var msg = {
    start: new Date().getTime(),
    result_callback: result_callback,
    callbacks: {}
  };

  var cbIdxs = [];
  params.forEach(function(param, idx) {
    if (isFunction(param)) {
      msg.callbacks[idx] = param;
      params[idx] = undefined;
      cbIdxs.push(idx);
    }
  });

  this._msgs[msgId] = msg;
  this._postMsg(msgId, method, params, cbIdxs);
  return result_callback;
}

function PMCommReceiver(objectName) {
  var callback_handler = function(id, resSource, resOrigin, cbIdx) {
    return function() {
      var msg = {
        id: id,
        cbIdx: cbIdx,
        callback_data: JSON.stringify(parseArgs(arguments)),
        type: PMComm_RECEIVER
      };
      resSource.postMessage(msg, resOrigin);
    }
  }
  window.addEventListener('message', function(e) {
    if (e.data.type===PMComm_SENDER && e.data.id && e.data.send && e.data.send.obj===objectName) {
      var send = e.data.send;
      var obj = eval(send.obj);
      var method = eval(send.obj+'.'+send.method);
      var res = null;
      var params = JSON.parse(send.params);
      send.cbIdxs.forEach(function(cbIdx) {
        params[cbIdx] = callback_handler(e.data.id, e.source, e.origin, cbIdx);
      });
      try {
        res = method.apply(obj, params);
        var msg = {
          id: e.data.id,
          result: JSON.stringify(res),
          type: PMComm_RECEIVER
        };
      }
      catch (err) {
        console.error(err);
        var msg = {
          id: e.data.id,
          error: JSON.stringify(err.toString()),
          type: PMComm_RECEIVER
        };
      }
      e.source.postMessage(msg, e.origin);
    }
  }, false);
}

return {
  PMCommSender: PMCommSender,
  PMCommReceiver: PMCommReceiver
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
var PMCommSender = __pmcomm__.PMCommSender;

/**
  * Create a proxy listener for object
  * @method
  * @param {String} objectName - Variable name of the object
  */
var PMCommReceiver = __pmcomm__.PMCommReceiver;
