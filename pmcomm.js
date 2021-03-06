(function() {

'use strict';

function uniqueId() {
  return Math.random().toString(36).substring(2) + '-' + Date.now().toString(36);
}

var _S = {

  msgs: {},

  createMsg: function(proxyObj, resolve, reject, callbacks) {
    var id = uniqueId();
    var msg = {
      obj: proxyObj,
      resolve: resolve,
      reject: reject,
      callbacks: callbacks
    };
    _S.msgs[id] = msg;
    proxyObj.__data.msgs[id] = true;
    return id;
  },

  deleteMsg: function(id) {
    var msg = _S.msgs[id];
    if (msg) {
      delete msg.obj.__data.msgs[id];
      delete _S.msgs[id];
    }
  },

  create: function(targetWindow, targetOrigin, targetName) {
    return new Promise(function(resolve, reject) {
      var proxyObj = {};
      proxyObj.__data = {
        window: targetWindow,
        origin: targetOrigin,
        name: targetName,
        msgs: {}
      };
      _S.query(proxyObj).then(function(res) {
        var methods = res.methods;
        var direct = res.direct;
        methods.forEach(function(method) {
          if (direct) {
            proxyObj[method] = function() {
              var params = Array.prototype.slice.call(arguments);
              return new Promise(function(resolve, reject) {
                resolve(proxyObj.__data.window.PMCommReceiver.invoke(targetName, method, params));
              });
            };
          } else {
            proxyObj[method] = function() {
              var params = Array.prototype.slice.call(arguments);
              return _S.invoke(proxyObj, method, params);
            };  
          }
        });
      }).then(function() {
        resolve(proxyObj);
      });
    });
  },

  destroy: function(proxyObj) {
    Object.keys(proxyObj.__data.msgs).forEach(function(id) {
      _S.deleteMsg(id);
    });
  },

  query: function(proxyObj) {
    return new Promise(function(resolve, reject) {

      // Try to query remote object for 20 times in 0.5 second interval.
      // We want to try a few times in case pmcomm message listener is not initalized in the other frame.
      // First we try to see if we can access the object directly in the other frame window.
      // If that fails, we will use post message.
      var count = 20;
      var interval = setInterval(function() {
        try {
          proxyObj.__data.window.PMCommReceiver.query(proxyObj.__data.name).then(function(methods) {
            clearInterval(interval)
            interval && resolve({
              methods: methods,
              direct: true
            });
            interval = null;
          });
        }
        catch (err) {
          var msgId = uniqueId();
          var query = {
            name: proxyObj.__data.name
          };
          proxyObj.__data.window && proxyObj.__data.window.postMessage({
            pmcomm_id: _S.createMsg(proxyObj, function(methods) {
              clearInterval(interval)
              interval && resolve({
                methods: methods,
                direct: false
              });
              interval = null;
            }, reject, {}),
            query: query
          }, proxyObj.__data.origin);
        }
        count--;
        !count && clearInterval(interval);
      }, 500)
    });
  },

  invoke: function(proxyObj, method, params) {
    return new Promise(function(resolve, reject) {
      var cbIdxs = [];
      var callbacks = [];
      params.forEach(function(param, idx) {
        if (typeof param==='function') {
          callbacks[idx] = param;
          params[idx] = undefined;
          cbIdxs.push(idx);
        }
      });

      var msgId = _S.createMsg(proxyObj, resolve, reject, callbacks);

      if (typeof params === 'undefined') {
        params = [];
      }
      var send = {
        name: proxyObj.__data.name,
        method: method,
        params: params,
        cbIdxs: cbIdxs
      };
      proxyObj.__data.window.postMessage({
        pmcomm_id: msgId,
        send: send
      }, proxyObj.__data.origin);
    });
  },

  handleResultMsg: function(msgId, res, source, origin) {
    var msg = _S.msgs[msgId];
    if (res.result || res.error) {
      if (res.error) {
        msg.reject(msgId+' '+res.error);
      } else {
        msg.resolve(res.result);
      }
      msg.resolve = msg.reject = null;
    }
    if ('cbIdx' in res) {
      var idx = res.cbIdx;
      var callback = msg.callbacks[idx];
      var callback_data = res.callback_data;
      try {
        callback.apply(callback, callback_data);
      }
      catch (err) {
        console.error(e.data.id, err);
      }
    }

    // Delete message handler if it is no longer necessary
    if (Object.keys(msg.callbacks).length===0 && msg.resolve===null) {
      _S.deleteMsg(msgId);
    }

  }

};

var _R = {
  receiverObjs: {},
  
  inspect: function(obj) {
    var methods = [];

    // get prototype methods for classes
    var prototype = Object.getPrototypeOf(obj);
    do {
        methods = methods.concat(Object.getOwnPropertyNames(prototype));
    } while (prototype = Object.getPrototypeOf(prototype));
  
    // get hash methods for object literals
    methods = methods.concat(Object.keys(obj))

    return methods.sort().filter(function(e, i, arr) { 
        return !(e in {}) && e!==arr[i+1] && typeof obj[e] === "function" && e!=="constructor";
    });
  },

  receiverCallbackHandler: function(id, resSource, resOrigin, cbIdx) {
    return function() {
      var msg = {
        pmcomm_id: id,
        res: {
          cbIdx: cbIdx,
          callback_data: Array.prototype.slice.call(arguments),  
        }
      };
      resSource.postMessage(msg, resOrigin);
    };
  },

  respondToQuery: function(methods, id, source, origin) {
    if (id!==null) {
      var msg = {
        pmcomm_id: id,
        res: {
          result:Object.keys(methods)
        }
      };
      source.postMessage(msg, origin);
    } else {
      source(Object.keys(methods));
    }
  },

  handleQueryMsg: function(msgId, query, source, origin) {
    if (_R.receiverObjs.hasOwnProperty(query.name) && _R.receiverObjs[query.name].obj) {
      _R.respondToQuery(_R.receiverObjs[query.name].methods, msgId, source, origin);
      return;
    } else if (!_R.receiverObjs.hasOwnProperty(query.name)) {
      _R.receiverObjs[query.name] = {
        oninit: []
      };
    }

    // If the object is not initalized, then queue query requests
    _R.receiverObjs[query.name].oninit.push({
      id: msgId, 
      source: source,
      origin: origin
    });
  },

  handleSendMsg: function(msgId, send, source, origin) {
    var obj = _R.receiverObjs[send.name].obj;
    var res = null;
    var params = send.params;
    send.cbIdxs.forEach(function(cbIdx) {
      params[cbIdx] = _R.receiverCallbackHandler(msgId, source, origin, cbIdx);
    });
    var msg = {
      pmcomm_id: msgId,
      res: {}
    };
    try {
      if (!(send.method in _R.receiverObjs[send.name].methods)) {
        throw "Unsupported method: "+send.method;
      }
      res = obj[send.method].apply(obj, params);
      if (res instanceof Promise) {
        res.then(function(_res) {
          msg.res.result = _res;
          source.postMessage(msg, origin);    
        }).catch(function(_err) {
          console.error(msgId, err);
          msg.res.error = _err;
          source.postMessage(msg, origin);    
        })
      } else {
        msg.res.result = res;
        source.postMessage(msg, origin);  
      }
    }
    catch (err) {
      console.error(msgId, err);
      msg.res.error = err.toString();
      source.postMessage(msg, origin);
    }
  },

}; // _R

/** @lends <global> */
/**
 * @namespace
 */
window.PMCommReceiver = {

  /**
    * Create a listener 
    * @method
    * @param {Object} object - Actual object to be proxied
    * @param {string} objectName - Name of the listener
    * @param {list/RegExp} methods - List of names or matching RegExp of methods in object accessible by proxied object
    */
  create: function(obj, name, methods) {
    var _methods = {};
    if (methods===undefined) {
      methods = /^(?!_).+/;   // default is to include all functions that does not start with _
    }
    if (methods instanceof RegExp) {
      _R.inspect(obj).forEach(function(method) {
        if (methods.test(method)) {
          _methods[method] = true;
        }
      });
    } else {
      methods.forEach(function(method) {
        _methods[method] = true;
      });
    }
    if (!_R.receiverObjs.hasOwnProperty(name)) {
      _R.receiverObjs[name] = {};
    }
    _R.receiverObjs[name].obj = obj;
    _R.receiverObjs[name].methods = _methods;

    // respond to queued query requests
    if (_R.receiverObjs[name].oninit) {
      _R.receiverObjs[name].oninit.forEach(function(oninit) {
        _R.respondToQuery(_methods, oninit.id, oninit.source, oninit.origin);
      });
      delete _R.receiverObjs[name]['oninit'];
    }
  },

  /**
   * Destroy a listener
   * @method
   * @param {String} name - Name of the listener
   */
  destroy: function(name) {
    delete _R.receiverObjs[name];
  },

  /** 
   *Query an object methods directly (without messaging)
   * @method 
   * @param {String} name - Name of the listener
   */
  query: function(name) {
    return new Promise(function(resolve, reject) {
      _R.handleQueryMsg(null, {name: name}, resolve, null);
    });
  },

  /** 
   * Invoke an object directly (without messaging)
   * @method 
   * @param {String} name - Name of the listener
   * @param {String} method - Name of the function
   * @param {list} params - List of parameters
   */
  invoke: function(name, method, params) {
    var obj = _R.receiverObjs[name].obj;
    return obj[method].apply(obj, params);
  }

};

/** @lends <global> */
/**
 * @namespace
 */
window.PMCommSender = {

  /**
    * Create a proxy object
    * @method
    * @param {Window} otherWindow - A reference to another frame where the actual object is
    * @param {string} targetOrigin - Specifies what the origin of otherWindow must be for the event to be dispatched, either as the literal string "*" (indicating no preference) or as a URI
    * @param {string} targetObjectName - Name of the listener
    * 
    * @returns {Object} Proxy object
    */
  create: function(targetWindow, targetOrigin, targetName) {
    return _S.create(targetWindow, targetOrigin, targetName);
  },

  /**
   * Destory a proxy
   * @method
   * @param {Object} proxyObj - proxy object to be destoryed
   */
  destroy: function(proxyObj) {
    _S.destroy(proxyObj);
  }
};

window.addEventListener('message', function(e) {

  if (!e.data.pmcomm_id) {
    return;
  }
  
  var msgId = e.data.pmcomm_id;
  if (e.data.query) {
    _R.handleQueryMsg(msgId, e.data.query, e.source, e.origin);
  } else if (e.data.send && e.data.send.name in _R.receiverObjs) {
    _R.handleSendMsg(msgId, e.data.send, e.source, e.origin);
  } else if (e.data.res && msgId in _S.msgs) {
    _S.handleResultMsg(msgId, e.data.res, e.source, e.origin);
  }

}, false);

})();
