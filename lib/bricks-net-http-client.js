'use strict';

var inherits = require('util').inherits;
var fs = require('fs');
var net = require('net');

var when = require('when');
var whenPipeline = require('when/pipeline');

var cppArguments = require('./cpp-arguments');
var promiseHelpers = require('./promise-helpers');

var URL = require('./bricks-net-url').URL;

var HTTPRedirectNotAllowedException = require('./bricks-net-exceptions').HTTPRedirectNotAllowedException;
var HTTPRedirectLoopException = require('./bricks-net-exceptions').HTTPRedirectLoopException;

var DefaultContentType = require('./bricks-net-http-request').DefaultContentType;
var HTTPRequestBase = require('./bricks-net-http-request').HTTPRequestBase;
var GET = require('./bricks-net-http-request').GET;
var POST = require('./bricks-net-http-request').POST;
var POSTFromFile = require('./bricks-net-http-request').POSTFromFile;

var HTTPResponse = require('./bricks-net-http-response').HTTPResponse;
var HTTPResponseWithBuffer = require('./bricks-net-http-response').HTTPResponseWithBuffer;
var HTTPResponseWithResultingFileName = require('./bricks-net-http-response').HTTPResponseWithResultingFileName;
var KeepResponseInMemory = require('./bricks-net-http-response').KeepResponseInMemory;
var SaveResponseToFile = require('./bricks-net-http-response').SaveResponseToFile;

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;

var HTTPRequestData = require('./bricks-net-http-impl').HTTPRequestData;

var ClientSocket = require('./bricks-net-tcp-impl').ClientSocket;


function HTTPRedirectableRequestData() {
	HTTPRequestData.apply(this, arguments);
	
	var _this = this;
	
	Object.defineProperties(_this, {
		toString: {
			configurable: true,
			enumerable: false,
			value: function () {
				return 'HTTPRedirectableRequestData';
			}
		}
	});
	
	// public:
	_this.location = "";
}
inherits(HTTPRedirectableRequestData, HTTPRequestData);
HTTPRedirectableRequestData.prototype.OnHeader = function (key, value) {
	HTTPRequestData.prototype.OnHeader.apply(this, arguments);
	if ("Location" === key) {
		this.location = value;
	}
};


function HTTPClient() {
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
				return 'HTTPClient';
			}
		},
		
		// private:
		// Request parameters.
		request_method_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		request_url_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		request_body_content_type_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		request_has_body_: {
			enumerable: false,
			writable: true,
			value: false
		},
		request_body_contents_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		request_user_agent_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		request_extra_headers_: {
			enumerable: false,
			writable: true,
			value: []
		},
		
		// Output parameters.
		response_code_: {
			enumerable: false,
			writable: true,
			value: HTTPResponseCode.InvalidCode
		},
		response_url_after_redirects_: {
			enumerable: false,
			writable: true,
			value: ""
		}
	});
	
	
	// Performs an HTTP request and calls itself if a redirect is received.
	// Called once from HTTPClient#Go() method.
	_this._performRequest = function () {
		_this._DEBUG_LOG(_this + '#_performRequest: Begin.');
			
		var all_urls = _this.all_urls_;
		var composed_url = _this.parsed_url_.ComposeURL();
		if (all_urls[composed_url]) {
			_this.resolver.reject(HTTPRedirectLoopException());
			return;
		}
		all_urls[composed_url] = true;
	
		var writes = [];
	
		writes.push(
			_this.request_method_ + ' ' + _this.parsed_url_.path + _this.parsed_url_.ComposeParameters() +
				" HTTP/1.1\r\n"
		);
		writes.push(
			"Host: " + _this.parsed_url_.host + "\r\n"
		);
		if (_this.request_user_agent_) {
			writes.push(
				"User-Agent: " + _this.request_user_agent_ + "\r\n"
			);
		}
		if (_this.request_body_content_type_) {
			writes.push("Content-Type: " + _this.request_body_content_type_ + "\r\n");
		}
	
		if (_this.request_has_body_) {
			writes.push("Content-Length: " + _this.request_body_contents_.length + "\r\n");
		}
		
		_this.request_extra_headers_.forEach(function (header) {
			writes.push(header.first + ": " + header.second + "\r\n");
		});
		writes.push("\r\n");
		
		if (_this.request_has_body_) {
			writes.push(_this.request_body_contents_);
		}
		
		
		var connection;
		
		function finish(err) {
			_this._DEBUG_LOG(_this + '#_performRequest: Finish:', err || 'OK');
			
			if (err) { return _this.resolver.reject(err); }
			_this.resolver.resolve(_this);
		}
		
		var promise = when.resolve();
		
		promise = promise.then(function () {
			_this._DEBUG_LOG(_this + '#_performRequest: ClientSocket:', _this.parsed_url_.host, _this.parsed_url_.port);
			return ClientSocket(_this.parsed_url_.host, _this.parsed_url_.port);
		}).then(function (ret) {
			_this._DEBUG_LOG(_this + '#_performRequest: ClientSocket done:', ret);
			
			connection = ret;
		});
		
		function writeNext() {
			var chunk = writes.shift();
			
			_this._DEBUG_LOG(_this + '#_performRequest: Write next:', chunk);
			
			return connection.BlockingWrite(chunk);
		}
		
		writes.forEach(function () {
			promise = promise.then(writeNext);
		});
		
		promise = promise.then(function () {
			_this._DEBUG_LOG(_this + '#_performRequest: new HTTPRedirectableRequestData');
			return new HTTPRedirectableRequestData(connection);
		}).then(function (ret) {
			_this._DEBUG_LOG(_this + '#_performRequest: HTTPRedirectableRequestData done:', ret);
			
			_this.http_request_ = ret;
		});
		
		promise = promise.then(function () {
			var response_code_as_int = parseInt(_this.http_request_.RawPath(), 10);
			
			_this._DEBUG_LOG(_this + '#_performRequest: Parsing response code:', response_code_as_int);
			
			_this.response_code_ = HTTPResponseCode(response_code_as_int);
			
			if (response_code_as_int >= 300 && response_code_as_int <= 399 && _this.http_request_.location) {
				_this._DEBUG_LOG(_this + '#_performRequest: Got a redirect:', _this.http_request_.location);
				
				// Note: This is by no means a complete redirect implementation.
				_this.parsed_url_ = URL(_this.http_request_.location, _this.parsed_url_);
				_this.response_url_after_redirects_ = _this.parsed_url_.ComposeURL();
				
				// Close the connection before sending the next request.
				connection.destroy();
				connection = null;
				
				return _this._performRequest();
			}
			else {
				// Close the connection after receiving the response.
				connection.destroy();
				connection = null;
				
				finish();
			}
		});
		
		return promise;
	};
}
HTTPClient.prototype.Go = function () {
	var _this = this;
	
	// Lazy evaluation.
	if (!_this._requested) {
		_this._requested = true;
		
		_this.response_url_after_redirects_ = _this.request_url_;
		_this.parsed_url_ = URL(_this.request_url_);
		_this.all_urls_ = {};
		
		_this._DEBUG_LOG(_this + '#Go:', _this.parsed_url_.ComposeURL());
		
		_this._performRequest();
	}
	
	// The return value `true`/`false` can only be a promise in async implementation.
	return when(_this).then(function () {
		return true;
	}, function (err) {
		return false;
	});
};
HTTPClient.prototype.HTTPRequest = function () {
	return this.http_request_;
};


function PrepareInput(request, client) {
	// The `request` below is actually `request_params`.
	if (request instanceof GET) {
		client.request_method_ = "GET";
		client.request_url_ = request.url;
		if (request.custom_user_agent) {
			client.request_user_agent_ = request.custom_user_agent;
		}
		client.request_extra_headers_ = request.extra_headers;
	}
	else if (request instanceof POST) {
		client.request_method_ = "POST";
		client.request_url_ = request.url;
		if (request.custom_user_agent) {
			client.request_user_agent_ = request.custom_user_agent;
		}
		client.request_extra_headers_ = request.extra_headers;
		client.request_has_body_ = request.has_body;
		if (request.has_body) {
			client.request_body_contents_ = request.body;
			client.request_body_content_type_ = request.content_type;
		}
	}
	else if (request instanceof POSTFromFile) {
		client.request_method_ = "POST";
		client.request_url_ = request.url;
		if (request.custom_user_agent) {
			client.request_user_agent_ = request.custom_user_agent;
		}
		client.request_extra_headers_ = request.extra_headers;
		client.request_has_body_ = true;
		client.request_body_contents_ = fs.readFileSync(request.file_name);  // Can throw.
		client.request_body_content_type_ = request.content_type;
	}
	else if (request instanceof KeepResponseInMemory) {
		// The `request` here is actually `response_params`.
	}
	else if (request instanceof SaveResponseToFile) {
		// The `request` here is actually `response_params`.
		if (!request.file_name || typeof request.file_name !== 'string') {
			throw new Error('Property "file_name" must be a non-empty string on SaveResponseToFile.');
		}
	}
	else {
		throw new Error('Expected one of: GET, POST, POSTFromFile, KeepResponseInMemory, SaveResponseToFile.');
	}
}

function ParseOutput(request_params, response_params, response, output) {
	if (!(output instanceof HTTPResponse)) {
		throw new Error('Argument "output" must be HTTPResponse, ' + (typeof output) + ' given.');
	}
	
	when(response).then(function () {
		if (!request_params.allow_redirects && request_params.url != response.response_url_after_redirects_) {
			throw HTTPRedirectNotAllowedException();
		}
		output.url = response.response_url_after_redirects_;
		output.code = response.response_code_;
		
		if (output instanceof HTTPResponseWithBuffer) {
			var http_request = response.HTTPRequest();
			output.body = http_request.HasBody() ? http_request.Body() : "";
		}
		else if (output instanceof HTTPResponseWithResultingFileName) {
			var http_request = response.HTTPRequest();
			// TODO(sompylasar): Make this an async writeFile and return its promise.
			fs.writeFileSync(response_params.file_name, http_request.HasBody() ? http_request.Body() : "");
			output.body_file_name = response_params.file_name;
		}
	}).done(function () {
		output.resolver.resolve(output);
	}, function (err) {
		output.resolver.reject(err);
	});
}


exports.isRequestParams = function (value) {
	return (value instanceof HTTPRequestBase);
};

exports.isResponseParams = function (value) {
	return (
		(value instanceof KeepResponseInMemory)
		|| (value instanceof SaveResponseToFile)
	);
};

exports.run = function () {
	return cppArguments.assert('HTTP', [
		[
			cppArguments.assertion(exports.isRequestParams, 'const T_REQUEST_PARAMS&', 'request_params'),
			cppArguments.assertion(exports.isResponseParams, 'const T_RESPONSE_PARAMS&', 'response_params', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (request_params, response_params) {
				if (typeof response_params === 'undefined') {
					response_params = KeepResponseInMemory();
				}
	
				var HTTPResponseInferred;
				if (response_params instanceof KeepResponseInMemory) {
					HTTPResponseInferred = HTTPResponseWithBuffer;
				}
				else if (response_params instanceof SaveResponseToFile) {
					HTTPResponseInferred = HTTPResponseWithResultingFileName;
				}
				else {
					throw new Error('Argument "response_params" must be either KeepResponseInMemory or SaveResponseToFile.');
				}
	
				var impl = new HTTPClient();
	
				PrepareInput(request_params, impl);
				PrepareInput(response_params, impl);
	
				var output = new HTTPResponseInferred();
	
				impl.Go();
	
				ParseOutput(request_params, response_params, impl, output);
				
				return output;
			}
		]
	], arguments);
};
