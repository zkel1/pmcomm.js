Overview
========

pmcomm.js creates a proxy object to a javascript object in another frame. The proxied object can be used as it was an object in the local frame. pmcomm.js has the following characteristics:
* Cross domain iframe invocation of javascript objects
* Small, 3k minified
* Does not depend on any libraries
* Works with all modern browsers
* JSON.stringify is used to encode proxied method parameters

Examples
========
First, we need to create a proxy object to an object in another frame.
```javascript
var repeaterProxy = new PMCommSender(
  window.frames.example_frame, // the other frame
  '*', // origin
  'repeater', // object name in the other frame
  [ // methods of object to proxy
    'repeat',
    'repeatCallback',
    'error'
  ]
);
```
The repeater object is now a proxy to repeater object in example_frame. The repeater object defined in example_frame as:
```javascript
var repeater = {
  repeat: function(msg) {
    write(msg);
    return msg;
  },
  repeatCallback: function(msg, callback) {
    write(msg);
    callback(msg);
  },
  error: function(msg, callback) {
    write('Creating an error.  See debug console.')
    oops
  }
}

PMCommReceiver('repeater');
```
PMCommReceiver('repeater') creates a handler for remote invocation to the repeater object.

Example 1
---------
In the first example, we call an object in another frame and get back a response from the return method of the proxied object.
```javascript
repeaterProxy.repeat("Hello...").success(function(res) {
  console.log(res);
});
```

Example 2
---------
In the second example, we call an object in another frame and receive a callback from the proxied object.
```javascript
repeaterProxy.repeatCallback("Hello again...", function(res) {
  console.log(res);
});
```

Example 3
---------
In the third example, we will demostrate how errors are handled. For this example, please open you javascript debugger console. You can see the logged error messages.
```javascript
repeaterProxy.error("Hey!").error(function(err) {
  console.error(err);
});
```
