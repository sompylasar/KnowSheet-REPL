'use strict';

var fs = require('fs');
var util = require('util');
var inherits = require('util').inherits;
var net = require('net');

var cppArguments = require('./cpp-arguments');

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;

var BRICKS_THROW = require('./bricks-throw');
var HTTPRedirectNotAllowedException = require('./bricks-net-exceptions').HTTPRedirectNotAllowedException;
var HTTPRedirectLoopException = require('./bricks-net-exceptions').HTTPRedirectLoopException;

var URL = require('./bricks-net-url').URL;


// Structures to define HTTP requests.
// Support GET and POST.
// The syntax for creating an instance of a GET request is GET is `GET(url)`.
// The syntax for creating an instance of a POST request is POST is `POST(url, data, content_type)`'.
// Alternatively, `POSTFromFile(url, file_name, content_type)` is supported.
// Both GET and two forms of POST allow `.UserAgent(custom_user_agent)`.
function HTTPRequestBase(url) {
	cppArguments.assert('HTTPRequestBase', [
		[ cppArguments.assertion('string', 'const std::string&', 'url') ]
	], arguments);
	
	this.url = url;
	this.custom_user_agent = "";
	this.allow_redirects = false;
}
HTTPRequestBase.prototype.UserAgent = function (new_custom_user_agent) {
	cppArguments.assert('HTTPRequestBase::UserAgent', [
		[ cppArguments.assertion('string', 'const std::string&', 'new_custom_user_agent') ]
	], arguments);
	
	this.custom_user_agent = new_custom_user_agent;
	
	return this;
};
HTTPRequestBase.prototype.AllowRedirects = function (allow_redirects_setting) {
	cppArguments.assert('HTTPRequestBase::AllowRedirects', [
		[ cppArguments.assertion('bool', 'const std::string&', 'allow_redirects_setting', cppArguments.ASSERTION_MODE_OPTIONAL) ]
	], arguments);
	
	this.allow_redirects = allow_redirects_setting;
	
	return this;
};
HTTPRequestBase.prototype.toString = function () {
	return this.method + ' ' + this.path + ' ' + '\n' + (this.body || '');
};


function GET(url) {
	var _this = this;
	
	if (!(_this instanceof GET)) {
		_this = new GET(url);
		return _this;
	}
	
	cppArguments.assert('GET', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			function (url) {
				HTTPRequestBase.call(_this, url);
			}
		]
	], arguments);
}
inherits(GET, HTTPRequestBase);
GET.prototype.toString = function () {
	return '[GET ' + this.url + ']';
};


function POST(url) {
	var _this = this;
	
	if (!(_this instanceof POST)) {
		// HACK: Cannot use `apply` to call a constructor with the exact number of arguments.
		switch (arguments.length) {
			case 0:
				// HACK: We know `POST` `cppArguments.assert` will throw on this.
				_this = new POST();
				break;
		
			case 1:
				_this = new POST(arguments[0]);
				break;
		
			case 2:
				_this = new POST(arguments[0], arguments[1]);
				break;
		
			case 3:
				_this = new POST(arguments[0], arguments[1], arguments[2]);
				break;
		
			default:
				// HACK: We know `POST` `cppArguments.assert` will throw on this.
				_this = new POST(arguments[0], arguments[1], arguments[2], arguments[3]);
				break;
		}
		return _this;
	}
	
	_this.has_body = false;
	_this.body = "";
	_this.content_type = "";
	
	cppArguments.assert('POST', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			function (url) {
				HTTPRequestBase.call(_this, url);
			}
		],
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion('string', 'const std::string&', 'body'),
			cppArguments.assertion('string', 'const std::string&', 'content_type'),
			function (url, body, content_type) {
				HTTPRequestBase.call(_this, url);
				
				_this.has_body = true;
				_this.body = body;
				_this.content_type = content_type;
			}
		],
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion('object', 'const T&', 'object'),
			function (url, object) {
				HTTPRequestBase.call(_this, url);
				
				_this.has_body = true;
				_this.body = JSON.stringify({ data: object });
				_this.content_type = "application/json";
			}
		]
	], arguments);
}
inherits(POST, HTTPRequestBase);
POST.prototype.toString = function () {
	return '[POST ' + this.url + ' ' + (this.has_body ? this.content_type + ';' + this.body : '<NO BODY>') + ']';
};


function POSTFromFile(url, file_name, content_type) {
	var _this = this;
	
	if (!(_this instanceof POSTFromFile)) {
		_this = new POSTFromFile(url, file_name, content_type);
		return _this;
	}
	
	_this.file_name = "";
	_this.content_type = "";
	
	cppArguments.assert('POSTFromFile', [
		[
			cppArguments.assertion('string', 'const std::string&', 'url'),
			cppArguments.assertion('string', 'const std::string&', 'file_name'),
			cppArguments.assertion('string', 'const std::string&', 'content_type'),
			function (url, file_name, content_type) {
				HTTPRequestBase.call(_this, url);
	
				_this.file_name = file_name;
				_this.content_type = content_type;
			}
		]
	], arguments);
}
inherits(POSTFromFile, HTTPRequestBase);


function HTTPResponse() {
	// The final URL. Will be equal to the original URL, unless redirects have been allowed and took place.
	this.url = "";
	// HTTP response code.
	this.code = 0;
}

function HTTPResponseWithBuffer() {
	HTTPResponse.call(this);
}
inherits(HTTPResponseWithBuffer, HTTPResponse);

function HTTPResponseWithResultingFileName() {
	// The file name into which the returned HTTP body has been saved.
	this.body_file_name = "";
}
inherits(HTTPResponseWithResultingFileName, HTTPResponse);


// Response storage policy.
// The default one is `KeepResponseInMemory()`, which can be omitted.
// The alternative one is `SaveResponseToFile(file_name)`.
function KeepResponseInMemory() {
	if (!(this instanceof KeepResponseInMemory)) {
		return new KeepResponseInMemory();
	}
}

function SaveResponseToFile(file_name) {
	var _this = this;
	
	if (!(_this instanceof SaveResponseToFile)) {
		return new SaveResponseToFile(file_name);
	}
	
	_this.file_name = "";
	
	cppArguments.assert('SaveResponseToFile', [
		[
			cppArguments.assertion('string', 'const std::string&', 'file_name'),
			function (file_name) {
				_this.file_name = file_name;
			}
		]
	], arguments);
}





function HTTPRedirectableRequestData(connection) {
	
}


function ClientSocket(host, port) {
	// TODO(sompylasar): Make the socket implementation.
	throw new Error("NOT IMPLEMENTED");
}

function Connection(socket) {
	// TODO(sompylasar): Make a connection via socket.
	throw new Error("NOT IMPLEMENTED");
}
Connection.prototype.BlockingWrite = function (content) {
	// TODO(sompylasar): Write the content to the socket.
	throw new Error("NOT IMPLEMENTED");
};


function HTTPClient() {
	var _this = this;
	
	// Request parameters.
	_this.request_method_ = "";
	_this.request_url_ = "";
	_this.request_body_content_type_ = "";
	_this.request_has_body_ = false;
	_this.request_body_contents_ = "";
	_this.request_user_agent_ = "";

	// Output parameters.
	_this.response_code_ = HTTPResponseCode.InvalidCode;
	_this.response_url_after_redirects_ = "";
}
HTTPClient.prototype.Go = function () {
	this.response_url_after_redirects_ = this.request_url_;
	var parsed_url = URL(this.request_url_);
	var all_urls = {};
	var redirected;
	do {
		redirected = false;
		var composed_url = parsed_url.ComposeURL();
		if (all_urls[composed_url]) {
			BRICKS_THROW(HTTPRedirectLoopException());
		}
		all_urls[composed_url] = true;
		var connection = new Connection(new ClientSocket(parsed_url.host, parsed_url.port));
		connection.BlockingWrite(this.request_method_ + ' ' + parsed_url.path + parsed_url.ComposeParameters() +
			" HTTP/1.1\r\n");
		connection.BlockingWrite("Host: " + parsed_url.host + "\r\n");
		if (this.request_user_agent_) {
			connection.BlockingWrite("User-Agent: " + this.request_user_agent_ + "\r\n");
		}
		if (this.request_body_content_type_) {
			connection.BlockingWrite("Content-Type: " + this.request_body_content_type_ + "\r\n");
		}
		if (this.request_has_body_) {
			connection.BlockingWrite("Content-Length: " + String(request_body_contents_.length) + "\r\n");
			connection.BlockingWrite("\r\n");
			connection.BlockingWrite(this.request_body_contents_);
		}
		else {
			connection.BlockingWrite("\r\n");
		}
		this.http_request_ = new HTTPRedirectableRequestData(connection);
		var response_code_as_int = parseInt(http_request_.RawPath(), 10);
		response_code_ = HTTPResponseCode(response_code_as_int);
		if (response_code_as_int >= 300 && response_code_as_int <= 399 && http_request_.location) {
			// Note: This is by no means a complete redirect implementation.
			redirected = true;
			parsed_url = URL(this.http_request_.location, parsed_url);
			this.response_url_after_redirects_ = parsed_url.ComposeURL();
		}
	} while (redirected);
	return true;
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
	}
	else if (request instanceof POST) {
		client.request_method_ = "POST";
		client.request_url_ = request.url;
		if (request.custom_user_agent) {
			client.request_user_agent_ = request.custom_user_agent;
		}
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
	if (output instanceof HTTPResponse) {
		if (!request_params.allow_redirects && request_params.url != response.response_url_after_redirects_) {
			BRICKS_THROW(HTTPRedirectNotAllowedException());
		}
		output.url = response.response_url_after_redirects_;
		output.code = response.response_code_;
		
		if (output instanceof HTTPResponseWithBuffer) {
			var http_request = response.HTTPRequest();
			output.body = http_request.HasBody() ? http_request.Body() : "";
		}
		else if (output instanceof HTTPResponseWithResultingFileName) {
		// TODO(dkorolev): This is doubly inefficient. Should write the buffer or write in chunks instead.
			var http_request = response.HTTPRequest();
			fs.writeFileSync(response_params.file_name, http_request.HasBody() ? http_request.Body() : "");
			output.body_file_name = response_params.file_name;
		}
	}
}


function HTTP() {
	var _this = this;
	
	cppArguments.assert('HTTP', [
		[
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPRequestBase);
			}, 'const T_REQUEST_PARAMS&', 'request_params'),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPResponse);
			}, 'const T_RESPONSE_PARAMS&', 'response_params', cppArguments.ASSERTION_MODE_OPTIONAL),
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
				
				if (!impl.Go()) {
					return new HTTPResponseInferred();
				}
				
				var output = new HTTPResponseInferred();
				ParseOutput(request_params, response_params, impl, output);
				return output;
			}
		],
	], arguments);
}


exports.GET = GET;
exports.POST = POST;
exports.POSTFromFile = POSTFromFile;
exports.HTTP = HTTP;

exports.KeepResponseInMemory = KeepResponseInMemory;
exports.SaveResponseToFile = SaveResponseToFile;

exports.URL = URL;
