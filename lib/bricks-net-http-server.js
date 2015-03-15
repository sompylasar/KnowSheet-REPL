'use strict';

var net = require('net');
var fs = require('fs');
var path = require('path');

var when = require('when');

var cppArguments = require('./cpp-arguments');
var promiseHelpers = require('./promise-helpers');

var URL = require('./bricks-net-url').URL;

var makeCppException = require('./cpp-exceptions').makeCppException;
var HTTPException = require('./bricks-net-exceptions').HTTPException;
var CannotServeStaticFilesOfUnknownMIMEType = require('./bricks-net-exceptions').CannotServeStaticFilesOfUnknownMIMEType;
var AttemptedToSendHTTPResponseMoreThanOnce = require('./bricks-net-exceptions').AttemptedToSendHTTPResponseMoreThanOnce;
var HandlerAlreadyExistsException = makeCppException(HTTPException, "HandlerAlreadyExistsException");
var HandlerDoesNotExistException = makeCppException(HTTPException, "HandlerDoesNotExistException");

var DefaultFourOhFourMessage = require('./bricks-net-http-default_messages').DefaultFourOhFourMessage;
var DefaultInternalServerErrorMessage = require('./bricks-net-http-default_messages').DefaultInternalServerErrorMessage;
var DefaultMethodNotAllowedMessage = require('./bricks-net-http-default_messages').DefaultMethodNotAllowedMessage;

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;

var Socket = require('./bricks-net-tcp-impl').Socket;

var HTTPServerConnection = require('./bricks-net-http-impl').HTTPServerConnection;
var ConnectionClose = require('./bricks-net-http-impl').ConnectionClose;
var ConnectionKeepAlive = require('./bricks-net-http-impl').ConnectionKeepAlive;

var HTTPHeaders = require('./bricks-net-http-headers').HTTPHeaders;


function StaticFileServer(body, content_type) {
	return function (r) {
		if (r.method == "GET") {
			r.connection.SendHTTPResponse(body, HTTPResponseCode.OK, content_type);
		}
		else {
			r.connection.SendHTTPResponse(
				DefaultMethodNotAllowedMessage(), HTTPResponseCode.MethodNotAllowed, "text/html");
		}
	};
}


function Request(connection) {
	if (!(this instanceof Request)) {
		return new Request(connection);
	}
	
	// Return a function that mimics the C++ `operator()` overload.
	var _this = function () {
		_this._DEBUG_LOG(_this + '#operator()(' + [].map.call(arguments, function (arg) {
			return require('util').inspect(arg);
		}).join(', ') + ')');
		return _this.connection.SendHTTPResponse.apply(connection, arguments);
	};
	
	Object.defineProperties(_this, {
		_DEBUG_LOG: {
			configurable: true,
			enumerable: false,
			value:
				/* istanbul ignore next: debug method */
				function () {}
				//function () { console.log.apply(console, arguments); }
		},
		toString: {
			configurable: true,
			enumerable: false,
			value: function () {
				return 'Request(' + connection + ')';
			}
		},
		SendChunkedResponse: {
			configurable: false,
			enumerable: false,
			writable: false,
			value: function () {
				return _this.connection.SendChunkedHTTPResponse();
			}
		}
	});
	
	_this.connection = connection;
	var http_data = _this.http_data = connection.HTTPRequest();
	_this.url = http_data.URL();
	_this.method = http_data.Method();
	var has_body = _this.has_body = http_data.HasBody();
	var empty_string = _this.empty_string = "";
	_this.body = (has_body ? http_data.Body() : empty_string);
	_this.timestamp = Date.now();
	
	return _this;
}


function HTTPServer(port) {
	var _this = this;
	
	promiseHelpers.makeThenable(_this);
	
	Object.defineProperties(_this, {
		_DEBUG_LOG: {
			configurable: true,
			enumerable: false,
			value:
				/* istanbul ignore next: debug method */
				function () {}
				//function () { console.log.apply(console, arguments); }
		},
		toString: {
			configurable: true,
			enumerable: false,
			value: function () {
				return 'HTTPServer(' + port + ')';
			}
		},
		
		// private:
		port_: {
			configurable: false,
			enumerable: false,
			value: port
		},
		handlers_: {
			configurable: false,
			enumerable: false,
			value: {}
		},
		handlers_paths_: {
			configurable: false,
			enumerable: false,
			value: []
		},
		socket_: {
			configurable: false,
			enumerable: false,
			value: Socket(port)
		}
	});
	
	function _accept() {
		when(_this.socket_.Accept()).done(function (acceptedConnection) {
			var connection = HTTPServerConnection(acceptedConnection);
			when(connection.HTTPRequest()).then(function () {
				var path = connection.HTTPRequest().URL().path;
				var handler = _this.handlers_[path];
				if (handler) {
					_this._DEBUG_LOG(_this + ': ' + connection + ' ' + path + ' handler found:', handler.toString());
					try {
						return handler(Request(connection));
					}
					catch (ex) {
						_this._DEBUG_LOG(_this + ': ' + connection + ' ' + path + ' handler exception:', ex);
						return when.reject(ex);
					}
				}
				else {
					_this._DEBUG_LOG(_this + ': ' + connection + ' ' + path + ' handler not found.');
					return connection.SendHTTPResponse(DefaultFourOhFourMessage(), HTTPResponseCode.NotFound, "text/html");
				}
			})
			.then(function () {
				_this._DEBUG_LOG(_this + ': ' + connection + ' served successfully.');
			}, function (err) {
				_this._DEBUG_LOG(_this + ': ' + connection + ' serving error:', err);
				
				process.stderr.write(_this + ': ' + connection + ' serving error: ' +
					(process.env.NODE_ENV === 'development' ? err.stack : err) + '\n\n');
			})
			.then(function () {
				// Call the destructor-like method when the handler has finished.
				return connection.destroy();
			})
			.then(undefined, function (err) {
				_this._DEBUG_LOG(_this + ': ' + connection + ' destroy error:', err);
				
				process.stderr.write(_this + ': ' + connection + ' destroy error: ' +
					(process.env.NODE_ENV === 'development' ? err.stack : err) + '\n\n');
			});
			
			_accept();
		}, function (err) {
			_this._DEBUG_LOG(_this + ': Accept error:', err);
			
			_accept();
		});
	}
	
	when(_this.socket_).then(function () {
		_accept();
	}).done(function () {
		_this.resolver.resolve(_this);
	}, function (err) {
		_this.resolver.reject(err);
	});
}
HTTPServer.prototype.Register = function () {
	var _this = this;
	
	cppArguments.assert('HTTPServer#Register', [
		[
			cppArguments.assertion('string', 'const std::string&', 'path'),
			cppArguments.assertion(function (value) {
				return (typeof value === 'function' && value.length === 1);
			}, 'std::function<void(Request)>', 'handler'),
			function (path, handler) {
				if (_this.handlers_[path]) {
					throw HandlerAlreadyExistsException(path);
				}
				_this.handlers_[path] = handler;
				_this.handlers_paths_.push(path);
			}
		]
	], arguments);
	
	return _this;
};
HTTPServer.prototype.UnRegister = function () {
	var _this = this;
	
	cppArguments.assert('HTTPServer#UnRegister', [
		[
			cppArguments.assertion('string', 'const std::string&', 'path'),
			function (path) {
				if (!_this.handlers_[path]) {
					throw HandlerDoesNotExistException(path);
				}
				delete _this.handlers_[path];
				var index = _this.handlers_paths_.indexOf(path);
				_this.handlers_paths_.splice(index, 1);
			}
		]
	], arguments);
	
	return _this;
};
HTTPServer.prototype.ServeStaticFilesFrom = function () {
	return cppArguments.assert('HTTPServer#ServeStaticFilesFrom', [
		[
			cppArguments.assertion('string', 'const std::string&', 'dir'),
			cppArguments.assertion('string', 'const std::string&', 'route_prefix', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (dir, route_prefix) {
				var _this = this;
				
				if (typeof route_prefix === 'undefined') {
					route_prefix = "/";
				}
				
				fs.readdirSync(dir).forEach(function (file) {
					var content_type = GetFileMimeType(file, "");
					if (content_type) {
						_this.Register(
							route_prefix + file,
							new StaticFileServer(fs.readFileSync(path.join(dir, file)), content_type));
					}
					else {
						throw CannotServeStaticFilesOfUnknownMIMEType(file);
					}
				});
			}
		]
	], arguments, this);
};
HTTPServer.prototype.ResetAllHandlers = function () {
	for (var ic = this.handlers_paths_.length, i = 0; i < ic; ++i) {
		this.UnRegister(this.handlers_paths_[i]);
		--i;
		--ic;
	}
};
HTTPServer.prototype.HandlersCount = function () {
	return this.handlers_paths_.length;
};


var _runningServers = {};


exports.HandlerAlreadyExistsException = HandlerAlreadyExistsException;
exports.HandlerDoesNotExistException = HandlerDoesNotExistException;

exports.ConnectionClose = ConnectionClose;
exports.ConnectionKeepAlive = ConnectionKeepAlive;

// Export to add the documentation in `bricks-net-api`.
exports.HTTPServer = HTTPServer;
exports.Request = Request;


exports.run = function () {
	return cppArguments.assert('HTTP', [
		[
			cppArguments.assertion('int', 'int', 'port'),
			function (port) {
				var server = _runningServers[port];
				
				if (!server) {
					_runningServers[port] = server = new HTTPServer(port);
				}
				
				return server;
			}
		]
	], arguments);
};
