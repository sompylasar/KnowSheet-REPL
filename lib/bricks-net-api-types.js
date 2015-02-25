'use strict';

var fs = require('fs');
var util = require('util');
var inherits = require('util').inherits;
var net = require('net');
var when = require('when');
var whenPipeline = require('when/pipeline');

var cppArguments = require('./cpp-arguments');

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;

var BRICKS_THROW = require('./bricks-throw');
var HTTPNoBodyProvidedException = require('./bricks-net-exceptions').HTTPNoBodyProvidedException;
var HTTPRedirectNotAllowedException = require('./bricks-net-exceptions').HTTPRedirectNotAllowedException;
var HTTPRedirectLoopException = require('./bricks-net-exceptions').HTTPRedirectLoopException;
var ConnectionResetByPeer = require('./bricks-net-exceptions').ConnectionResetByPeer;

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
	
	this.body = "";
}
inherits(HTTPResponseWithBuffer, HTTPResponse);

function HTTPResponseWithResultingFileName() {
	HTTPResponse.call(this);
	
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


function SocketHandle(socket) {
	if (!(this instanceof SocketHandle)) {
		return new SocketHandle(socket);
	}
	
	var _this = this;
	
	_this._socket = socket;
	
	socket.on('close', function () {
		_this._socket = null;
	});
}
SocketHandle.prototype.then = function () {
};


function TemplatedHTTPRequestData(socket) {
	var _this = this;
	
	_this._socket = socket;
	
	_this.buffer_ = new Buffer(0);
	
	_this.body_buffer_begin_ = 0;
	_this.body_buffer_end_ = 0;
}
TemplatedHTTPRequestData.prototype.then = function () {
	var _this = this;
	
	function strstr(buffer, str, start) {
		var i, ic, j, jc;
		for (ic = buffer.length, i = start || 0; i < ic; ++i) {
			for (jc = str.length, j = 0; j < jc; ++j) {
				if (buffer[i + j] === '\0') {
					break;
				}
				if (buffer[i + j] !== str.charAt(j)) {
					break;
				}
			}
			if (j === jc-1) {
				return i;
			}
		}
		return -1;
	}
	
	function BlockingRead(buffer, size, offset) {
		throw new Error('NOT IMPLEMENTED');
	}
	
	return (_this._promise || (_this._promise = when.promise(function (resolve, reject) {
		var offset = 0;
		var length_cap = ~~(-1);
		var current_line_offset = 0;
		var body_offset = ~~(-1);
		var body_length = ~~(-1);
		var first_line_parsed = false;
		var chunked_transfer_encoding = false;
		var receiving_body_in_chunks = false;
		
		var buffer_new_length = 0;
		
		var kCRLF = "\r\n";
		var kHeaderKeyValueSeparator = ":";
		var kHeaderKeyValueSeparatorLength = 1;
		var kContentLengthHeaderKey = "Content-Length";
		var kTransferEncodingChunkedValue = "Transfer-Encoding";
		
		while (offset < length_cap) {
			var chunk;
			var read_count;
			
			while (
				chunk = buffer_.length - offset - 1,
				read_count = BlockingRead(buffer_, chunk, offset),
				offset += read_count,
				read_count === chunk && offset < length_cap
			) {
				buffer_new_length = _this.buffer_.length * buffer_growth_k;
				_this.buffer_ = Buffer.concat([
					_this.buffer_,
					new Buffer(buffer_new_length - _this.buffer_.length)
				], buffer_new_length);
			}
			
			if (!read_count) {
				// TODO(sompylasar): Do something here.
				return reject(ConnectionResetByPeer());
			}
			
			buffer_[offset] = '\0';
			var next_crlf_ptr;
			while (
				(body_offset === ~~(-1) || offset < body_offset) &&
				(next_crlf_ptr = strstr(buffer_, kCRLF, current_line_offset)) >= 0
			) {
				var line_is_blank = (next_crlf_ptr === current_line_offset);
				buffer_[next_crlf_ptr] = '\0';
				var next_line_offset = next_crlf_ptr + kCRLFLength;
				if (!first_line_parsed) {
					if (!line_is_blank) {
						var pieces = buffer_.toString('utf8', current_line_offset, next_line_offset).split(/\s+/g);
						if (pieces.length >= 1) {
							_this.method_ = pieces[0];
						}
						if (pieces.length >= 2) {
							_this.raw_path_ = pieces[1];
							_this.url_ = URL(raw_path_);
						}
						first_line_parsed = true;
					}
				}
				else if (receiving_body_in_chunks) {
					if (!line_is_blank) {
						var chunk_length = parseInt(buffer_.toString('utf8', current_line_offset, next_line_offset), 16);
						if (chunk_length === 0) {
							throw new Error('NOT IMPLEMENTED');
							//_this.OnChunkedBodyDone(_this.body_buffer_begin_, _this.body_buffer_end_);
							return;
						}
						else {
							var chunk_offset = next_line_offset;
							var next_offset = chunk_offset + chunk_length;
							if (offset < next_offset) {
								var bytes_to_read = next_offset - offset;
								if (buffer_.length < next_offset + 1) {
									buffer_new_length = Math.max(_this.buffer_.length * buffer_growth_k, next_offset + 1);
									_this.buffer_ = Buffer.concat([
										_this.buffer_,
										new Buffer(buffer_new_length - _this.buffer_.length)
									], buffer_new_length);
								}
								if (bytes_to_read !== BlockingRead(buffer_, bytes_to_read, offset)) {
									BRICKS_THROW(ConnectionResetByPeer());
								}
								offset = next_offset;
							}
							_this.OnChunk(buffer_.toString('utf8', chunk_offset, chunk_offset + chunk_length));
							next_line_offset = next_offset;
						}
					}
				}
				else if (!line_is_blank) {
					var p = strstr(_this.buffer_, kHeaderKeyValueSeparator, current_line_offset);
					if (p >= 0) {
						_this.buffer_[p] = '\0';
						var key = _this.buffer_.slice(current_line_offset, p);
						var value = _this.buffer_.slice(p + kHeaderKeyValueSeparatorLength);
						_this.OnHeader(key, value);
						if (key === kContentLengthHeaderKey) {
							body_length = parseInt(value, 10);
						}
						else if (key === kTransferEncodingHeaderKey) {
							if (value === kTransferEncodingChunkedValue) {
								chunked_transfer_encoding = true;
							}
						}
					}
				}
				else {
					if (!chunked_transfer_encoding) {
						body_offset = next_line_offset;
						if (body_length !== ~~(-1)) {
							length_cap = body_offset + body_length;
							if (length_cap + 1 > buffer_.length) {
								var delta_size = length_cap + 1 - buffer_.length;
								buffer_new_length = Math.min(delta_size, buffer_max_growth_due_to_content_length);
								_this.buffer_ = Buffer.concat([
									_this.buffer_, 
									new Buffer(buffer_new_length - _this.buffer_.length)
								], buffer_new_length);
							}
						}
						else {
							length_cap = body_offset;
						}
					}
					else {
						receiving_body_in_chunks = true;
					}
				}
				current_line_offset = next_line_offset;
			}
			if (body_length !== ~~(-1)) {
			_this.body_buffer_begin_ = body_offset;
			_this.body_buffer_end_ = _this.body_buffer_begin_ + body_length;
		}
		}
	})));
};
TemplatedHTTPRequestData.prototype.Method = function () {
	return this.method_;
};
TemplatedHTTPRequestData.prototype.URL = function () {
	return this.url_;
};
TemplatedHTTPRequestData.prototype.RawPath = function () {
	return this.raw_path_;
};
TemplatedHTTPRequestData.prototype.HasBody = function () {
	return this.body_buffer_begin_;
};
TemplatedHTTPRequestData.prototype.Body = function () {
	var _this = this;
	if (!_this.prepared_body_) {
		if (_this.body_buffer_) {
			_this.prepared_body_ = _this.buffer_.toString('utf8', _this.body_buffer_begin_, _this.body_buffer_end_);
		} else {
			BRICKS_THROW(HTTPNoBodyProvidedException());
		}
	}
	return _this.prepared_body_;
};
TemplatedHTTPRequestData.prototype.BodyBegin = function () {
	throw new Error('HTTPRedirectableRequestData#BodyBegin: NOT IMPLEMENTED');
};
TemplatedHTTPRequestData.prototype.BodyEnd = function () {
	throw new Error('HTTPRedirectableRequestData#BodyEnd: NOT IMPLEMENTED');
};
TemplatedHTTPRequestData.prototype.BodyLength = function () {
	var _this = this;
	if (_this.body_buffer_begin_) {
		return (_this.body_buffer_end_ - _this.body_buffer_begin_);
	}
	else {
		BRICKS_THROW(HTTPNoBodyProvidedException());
	}
};
TemplatedHTTPRequestData.prototype.OnHeader = function (key, value) {};
TemplatedHTTPRequestData.prototype.OnChunkedBodyDone = function () {};
TemplatedHTTPRequestData.prototype.OnChunk = function (chunk) {};


function HTTPRedirectableRequestData() {
	TemplatedHTTPRequestData.apply(this, arguments);
	
	this.location = "";
}
inherits(HTTPRedirectableRequestData, TemplatedHTTPRequestData);
HTTPRedirectableRequestData.prototype.OnHeader = function (key, value) {
	if ("Location" === key) {
		this.location = value;
	}
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
	
	// Performs a single request.
	_this._performRequest = function () {
		console.log('HTTPClient#_performRequest: Begin.');
		
		var all_urls = _this.all_urls_;
		var composed_url = _this.parsed_url_.ComposeURL();
		if (all_urls[composed_url]) {
			BRICKS_THROW(HTTPRedirectLoopException());
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
			writes.push("Content-Length: " + String(_this.request_body_contents_.length) + "\r\n");
			writes.push("\r\n");
			writes.push(_this.request_body_contents_);
		}
		else {
			writes.push("\r\n");
		}
		
		var sequence = [];
		
		var socket;
		var buffer = new Buffer(0);
		
		sequence.unshift(function () {
			console.log('HTTPClient#_performRequest: Sequence started.');
			
			return when.promise(function (resolve, reject) {
				console.log('HTTPClient#_performRequest: Connect:', _this.parsed_url_.host, _this.parsed_url_.port);
				
				socket = new net.Socket();
				
				socket.on('data', function (data) {
					buffer = Buffer.concat([ buffer, data ], buffer.length + data.length);
				});
				socket.on('error', function (err) {
					reject(err);
				});
				
				socket.connect({
					host:  _this.parsed_url_.host,
					port:  _this.parsed_url_.port
				}, function (err) {
					if (err) { return reject(err); }
					resolve();
				});
			});
		});
		
		function writeNext() {
			var chunk = writes.shift();
			
			return when.promise(function (resolve, reject) {
				console.log('HTTPClient#_performRequest: Write:', JSON.stringify(chunk));
				
				socket.write(chunk, 'utf8', function (err) {
					if (err) { return reject(err); }
					resolve();
				});
			});
		}
		
		sequence.push.apply(sequence, writes.map(function () {
			return writeNext;
		}));
		
		sequence.push(function () {
			_this.http_request_ = new HTTPRedirectableRequestData(socket);
			return _this.http_request_;
		});
		
		sequence.push(function () {
			var response_code_as_int = parseInt(_this.http_request_.RawPath(), 10);
			response_code_ = HTTPResponseCode(response_code_as_int);
			if (response_code_as_int >= 300 && response_code_as_int <= 399 && _this.http_request_.location) {
				// Note: This is by no means a complete redirect implementation.
				_this.parsed_url_ = URL(_this.http_request_.location, _this.parsed_url_);
				_this.response_url_after_redirects_ = _this.parsed_url_.ComposeURL();
				
				return _this._performRequest();
			}
		});
		
		return whenPipeline(sequence);
	};
}
HTTPClient.prototype.Go = function () {
	var _this = this;
	
	// WARNING: This method is not reentrant.
	
	_this.response_url_after_redirects_ = _this.request_url_;
	_this.parsed_url_ = URL(_this.request_url_);
	_this.all_urls_ = {};
	
	return _this._performRequest();
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
	var retval;
	
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
				
				var output = new HTTPResponseInferred();
				
				retval = whenPipeline([
					function () {
						return impl.Go();
					},
					function () {
						ParseOutput(request_params, response_params, impl, output);
					},
					function () {
						return output;
					}
				]).then(void 0, function () {
					return output;
				});
			}
		],
	], arguments);
	
	return retval;
}


exports.GET = GET;
exports.POST = POST;
exports.POSTFromFile = POSTFromFile;
exports.HTTP = HTTP;

exports.HTTPResponse = HTTPResponse;

exports.KeepResponseInMemory = KeepResponseInMemory;
exports.SaveResponseToFile = SaveResponseToFile;

exports.URL = URL;
