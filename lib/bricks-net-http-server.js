'use strict';

var http = require('http');
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

var HTTPRequestData = require('./bricks-net-http-parser').HTTPRequestData;

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


function ChunkedResponseSender(request, response) {
	if (!(this instanceof ChunkedResponseSender)) {
		return new ChunkedResponseSender(request, response);
	}
	
	var _this = this;
	
	_this._request = request;
	_this._response = response;
	
	// TODO(sompylasar): Implement.
}


var ConnectionClose = { ConnectionClose: 1 };
var ConnectionKeepAlive = { ConnectionKeepAlive: 1 };

function HTTPServerConnection(request, response) {
	if (!(this instanceof HTTPServerConnection)) {
		return new HTTPServerConnection(request, response);
	}
	
	var _this = this;
	
	_this._request = request;
	_this._response = response;
	
	_this.message_ = {
		Method: function () {
			return _this._request.method;
		},
		URL: function () {
			return URL(_this._request.url);
		},
		RawPath: function () {
			return _this._request.path;
		},
		HasBody: function () {
			// TODO(sompylasar): Implement properly.
			return (
				typeof _this._request.body !== 'undefined' && (
					_this._request.method === 'POST' ||
					_this._request.method === 'PUT'
				)
			);
		},
		Body: function () {
			return (_this._request.body || "");
		}
	};
	_this.responded_ = false;
}
HTTPServerConnection.DefaultContentType = function () {
	return "text/plain";
};
HTTPServerConnection.prototype.SendHTTPResponse = function () {
	// TODO(sompylasar): Implement.
};
HTTPServerConnection.prototype.SendChunkedHTTPResponse = function () {
	var _this = this;
	var code = (typeof code === 'undefined' ? HTTPResponseCode.OK : code);
	var content_type = (typeof content_type === 'undefined' ? HTTPServerConnection.DefaultContentType() : content_type);
	var extra_headers = (typeof extra_headers === 'undefined' ? HTTPHeaders() : extra_headers);
	if (this.responded_) {
		throw AttemptedToSendHTTPResponseMoreThanOnce();
	}
	else {
		this.responded_ = true;
		
		// PrepareHTTPResponseHeader
		var headers = [
			[ "Content-Type", content_type ],
			[ "Connection", (connection_type === ConnectionKeepAlive ? "keep-alive" : "close") ]
		].concat(extra_headers.headers.map(function (header) {
			return [ header.first, header.second ];
		}));
		
		headers.push([ "Transfer-Encoding", "chunked" ]);
		
		this._response.removeHeader('Date');
		this._response.writeHead(code, HTTPResponseCodeAsString(code), headers);
		
		return when.promise(function (resolve, reject) {
			resolve(ChunkedResponseSender(_this._request, _this._response));
		});
	}
};
HTTPServerConnection.prototype.DoNotSendAnyResponse = function () {
	if (this.responded_) {
		throw AttemptedToSendHTTPResponseMoreThanOnce();
	}
	this.responded_ = true;
};
HTTPServerConnection.prototype.HTTPRequest = function () { return this.message_; }
HTTPServerConnection.prototype.RawConnection = function () { return this.connection_; }
Object.defineProperties(HTTPServerConnection.prototype, {
	destroy: {
		configurable: false,
		enumerable: false,
		writable: false,
		value: function () {
			if (!this.responded_) {
				this.SendHTTPResponse(
					DefaultInternalServerErrorMessage(), HTTPResponseCode.InternalServerError, "text/html");
			}
		}
	}
});


function Request(connection) {
	if (!(this instanceof Request)) {
		return new Request(connection);
	}
	
	// Return a function that mimics the C++ `operator()` overload.
	var retval = function () {
		connection.SendHTTPResponse.apply(connection, arguments);
	};
	
	retval.SendChunkedResponse = function () {
		return connection.SendChunkedHTTPResponse();
	};
	
	retval.connection = connection;
	var http_data = retval.http_data = connection.HTTPRequest();
	retval.url = http_data.URL();
	retval.method = http_data.Method();
	var has_body = retval.has_body = http_data.HasBody();
	var empty_string = retval.empty_string = "";
	retval.body = (has_body ? http_data.Body() : empty_string);
	
	return retval;
}


function HTTPServer(port) {
	var _this = this;
	
	_this._DEBUG_LOG = function () {};
	//_this._DEBUG_LOG = function () { console.log.apply(console, arguments); };
	
	// WARNING: The JS implementation terminates upon process exit only.
	_this.terminating_ = false;
	
	_this.port_ = port;
	
	_this.handlers_ = {};
	_this.handlers_count_ = 0;
	
	promiseHelpers.makeThenable(_this);
	
	var server = _this._server = http.createServer();
	var sockets = _this._sockets = [];
	server.on('connection', function (socket) {
		var socketString = socket.remoteAddress + ':' + socket.remotePort;
		_this._DEBUG_LOG('HTTPServer(' + _this.port_ + '): Got a connection:', socketString);
		
		sockets.push(socket);
		socket.on('close', function () {
			_this._DEBUG_LOG('HTTPServer(' + _this.port_ + '): Connection closed:', socketString);
			
			var index = sockets.indexOf(socket);
			if (index >= 0) {
				sockets.splice(index, 1);
			}
		});
	});
	server.on('request', function (request, response) {
		_this._DEBUG_LOG('HTTPServer(' + _this.port_ + '): Got request:', request.method, request.url, request.httpVersion, '\n', request.headers);
		
		var connection = HTTPServerConnection(request, response);
		try {
			var handler = _this.handlers_[ URL(request.url).path ];
		
			if (handler) {
				try {
					handler(Request(connection));
				}
				catch (ex) {
					console.error('HTTP route failed in user code: ' + (ex.message || ex));
				}
			}
			else {
				connection.SendHTTPResponse(DefaultFourOhFourMessage(), HTTPResponseCode.NotFound, "text/html");
			}
		}
		finally {
			// Call the destructor-like method ourselves, JS does not have destructors.
			connection.destroy();
		}
	});
	server.on('listening', function () {
		_this._DEBUG_LOG('HTTPServer(' + _this.port_ + '): Listening.');
		_this.resolver.resolve(_this);
	});
	server.on('error', function (err) {
		_this._DEBUG_LOG('HTTPServer(' + _this.port_ + '): Error:', err);
		_this.resolver.reject(err);
	});
	server.listen(_this.port_);
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
				++_this.handlers_count_;
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
				--_this.handlers_count_;
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
	this.handlers_ = {};
	this.handlers_count_ = 0;
};
HTTPServer.prototype.HandlersCount = function () {
	return this.handlers_count_;
};


var _runningServers = {};


exports.HandlerAlreadyExistsException = HandlerAlreadyExistsException;
exports.HandlerDoesNotExistException = HandlerDoesNotExistException;

exports.HTTPServerConnection = HTTPServerConnection;
exports.ConnectionClose = ConnectionClose;
exports.ConnectionKeepAlive = ConnectionKeepAlive;

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
