'use strict';

var inherits = require('util').inherits;
var inspect = require('util').inspect;

var when = require('when');
var whenPipeline = require('when/pipeline');

var cppArguments = require('./cpp-arguments');
var cppHelpers = require('./cpp-helpers');
var promiseHelpers = require('./promise-helpers');

var URL = require('./bricks-net-url').URL;

var ConnectionResetByPeer = require('./bricks-net-exceptions').ConnectionResetByPeer;
var AttemptedToSendHTTPResponseMoreThanOnce = require('./bricks-net-exceptions').AttemptedToSendHTTPResponseMoreThanOnce;

var DefaultInternalServerErrorMessage = require('./bricks-net-http-default_messages').DefaultInternalServerErrorMessage;

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;
var HTTPResponseCodeAsString = require('./bricks-net-http-codes').HTTPResponseCodeAsString;

var HTTPHeaders = require('./bricks-net-http-headers').HTTPHeaders;


var kCRLF = "\r\n";
var kCRLFLength = kCRLF.length;
var kHeaderKeyValueSeparator = ": ";
var kHeaderKeyValueSeparatorLength = kHeaderKeyValueSeparator.length;
var kContentLengthHeaderKey = "Content-Length";
var kTransferEncodingHeaderKey = "Transfer-Encoding";
var kTransferEncodingChunkedValue = "chunked";


function TemplatedHTTPRequestData(connection) {
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
				return 'TemplatedHTTPRequestData';
			}
		},
		
		// private:
		method_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		url_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		raw_path_: {
			enumerable: false,
			writable: true,
			value: ""
		},
		buffer_: {
			enumerable: false,
			writable: true,
			value: null
		},
		body_buffer_begin_: {
			enumerable: false,
			writable: true,
			value: null
		},
		body_buffer_end_: {
			enumerable: false,
			writable: true,
			value: null
		},
		prepared_body_: {
			enumerable: false,
			writable: true,
			value: null
		},
		chunked_body_buffer_: {
			enumerable: false,
			writable: true,
			value: null
		}
	});
	
	// Read the response right in the constructor (like in the original code, but async).
	(function () {
		_this._DEBUG_LOG(_this + ': Begin.');
		
		function strstr(buffer, str, start) {
			//_this._DEBUG_LOG(_this + ' strstr:',
			//	inspect(buffer.toString('utf8')),
			//	inspect(str),
			//	start
			//);
			
			var i, ic, j, jc;
			for (ic = buffer.length, i = start || 0; i < ic; ++i) {
				if (buffer[i] === 0) {
					break;
				}
				for (jc = str.length, j = 0; j < jc; ++j) {
					//_this._DEBUG_LOG(_this + ' strstr: ',
					//	i + j, buffer[i + j], j, str.charCodeAt(j), buffer[i + j] === str.charCodeAt(j));
					if (buffer[i + j] !== str.charCodeAt(j)) {
						break;
					}
				}
				if (j === jc) {
					//_this._DEBUG_LOG(_this + ' strstr: return ', i);
					return i;
				}
			}
			return -1;
		}
		
		
		var UINT_MAX = 0xffffffff;
		
		var intial_buffer_size = 1600;
		var buffer_growth_k = 1.95;
		var buffer_max_growth_due_to_content_length = 1024 * 1024;
		
		_this.buffer_ = new Buffer(intial_buffer_size);
		
		var offset = 0;
		var length_cap = UINT_MAX;
		var current_line_offset = 0;
		var body_offset = UINT_MAX;
		var body_length = UINT_MAX;
		var first_line_parsed = false;
		var chunked_transfer_encoding = false;
		var receiving_body_in_chunks = false;
		
		var buffer_new_length = 0;
		
		
		function finish(err) {
			_this._DEBUG_LOG(_this + ' finish:', (err || 'OK'));
		
			if (err) { return _this.resolver.reject(err); }
			_this.resolver.resolve(_this);
		}
		
		
		// The algorithm is broken into async parts.
		part1();
		
		function part1() {
			_this._DEBUG_LOG(_this + ': part1');
			
			// while1
			if (offset < length_cap) {
				_this._DEBUG_LOG(_this + ': part1 begin while1');
			
				part2();
			}
			// end while1
			else {
				_this._DEBUG_LOG(_this + ': part1 end while1');
				
				if (body_length !== UINT_MAX) {
					_this.body_buffer_begin_ = body_offset;
					_this.body_buffer_end_ = _this.body_buffer_begin_ + body_length;
				}
				
				finish();
			}
		}
		
		function part2() {
			_this._DEBUG_LOG(_this + ': part2');
			
			// while2
			var chunk = _this.buffer_.length - offset - 1;
			when(connection.BlockingRead(_this.buffer_, offset, chunk)).done(function (read_count) {
				_this._DEBUG_LOG(_this + ': part2 while2 after read',
					'read_count ===', read_count);
				
				part3(chunk, read_count);
			}, finish);
		}
		
		function part3(chunk, read_count) {
			_this._DEBUG_LOG(_this + ': part3 while2 after read');
			
			offset += read_count;
			if (read_count === chunk && offset < length_cap) {
				_this.buffer_ = Buffer.concat([
					_this.buffer_,
					new Buffer(Math.floor(_this.buffer_.length * buffer_growth_k) - _this.buffer_.length)
				], Math.floor(_this.buffer_.length * buffer_growth_k));
				
				// continue while2
				_this._DEBUG_LOG(_this + ': part3 continue while2');
				part2();
				return;
			}
			
			_this._DEBUG_LOG(_this + ': part3 finish while2',
				'read_count ===', read_count);
			
			if (!read_count) {
				finish(ConnectionResetByPeer());
				return;
			}
			
			_this.buffer_[offset] = '\0';
			
			_this._DEBUG_LOG(_this + ': part3 start while3');
			
			// start while3
			part4();
		}
		
		function part4() {
			_this._DEBUG_LOG(_this + ': part4');
			
			_this._DEBUG_LOG(_this + ': part4:', [
				offset, body_offset, current_line_offset
			]);
			
			// while3
			var next_crlf_ptr;
			if (
				(body_offset === UINT_MAX || offset < body_offset) &&
				(next_crlf_ptr = strstr(_this.buffer_, kCRLF, current_line_offset)) >= 0
			) {
				_this._DEBUG_LOG(_this + ': part4 begin while3',
					'next_crlf_ptr ===', next_crlf_ptr);
				
				part5(next_crlf_ptr);
			}
			// end while3
			else {
				_this._DEBUG_LOG(_this + ': part4 end while3');
				
				// continue while1
				part1();
			}
		}
		
		function part5(next_crlf_ptr) {
			_this._DEBUG_LOG(_this + ': part5',
				'next_crlf_ptr ===', next_crlf_ptr);
			
			var line_is_blank = (next_crlf_ptr === current_line_offset);
			
			_this._DEBUG_LOG(_this + ': part5 line_is_blank ===', line_is_blank);
			
			// We cannot end the string with '\0' so we have to track indexes.
			//_this.buffer_[next_crlf_ptr] = '\0';
			var next_line_offset = next_crlf_ptr + kCRLFLength;
			
			_this._DEBUG_LOG(_this + ': part5 next_line_offset ===', next_line_offset);
			
			if (!first_line_parsed) {
				_this._DEBUG_LOG(_this + ': part5 !first_line_parsed');
				
				if (!line_is_blank) {
					_this._DEBUG_LOG(_this + ': part5 !first_line_parsed !line_is_blank');
					
					var line = _this.buffer_.toString('utf8', current_line_offset, next_crlf_ptr);
					var pieces = line.split(/\s+/g);
					if (pieces.length >= 1) {
						_this.method_ = pieces[0];
					}
					if (pieces.length >= 2) {
						_this.raw_path_ = pieces[1];
						_this.url_ = URL(_this.raw_path_);
					}
					
					_this._DEBUG_LOG(_this + ': part5',
						'line ===', inspect(line),
						'pieces ===', pieces);
					
					first_line_parsed = true;
				}
			}
			else if (receiving_body_in_chunks) {
				_this._DEBUG_LOG(_this + ': part5 receiving_body_in_chunks');
				
				if (!line_is_blank) {
					_this._DEBUG_LOG(_this + ': part5 receiving_body_in_chunks !line_is_blank');
					
					var chunk_length_string = _this.buffer_.toString('utf8', current_line_offset, next_crlf_ptr);
					
					_this._DEBUG_LOG(_this + ': part5 receiving_body_in_chunks !line_is_blank chunk_length_string ===', chunk_length_string);
					
					var chunk_length = parseInt(chunk_length_string, 16);
					if (isNaN(chunk_length) || chunk_length < 0) {
						chunk_length = 0;
					}
					
					if (chunk_length === 0) {
						_this._DEBUG_LOG(_this + ': part5 OnChunkedBodyDone');
						_this.chunked_body_buffer_ = _this.OnChunkedBodyDone();
						finish();
						return;
					}
					else {
						var chunk_offset = next_line_offset;
						var next_offset = chunk_offset + chunk_length;
						if (offset < next_offset) {
							var bytes_to_read = next_offset - offset;
							if (_this.buffer_.length < next_offset + 1) {
								var buffer_new_length = Math.max(Math.floor(_this.buffer_.length * buffer_growth_k), next_offset + 1);
								_this.buffer_ = Buffer.concat([
									_this.buffer_,
									new Buffer(buffer_new_length - _this.buffer_.length)
								], buffer_new_length);
							}
							when(connection.BlockingRead(_this.buffer_, offset, bytes_to_read, true)).done(function (read_count) {
								if (bytes_to_read !== read_count) {
									finish(ConnectionResetByPeer());
									return;
								}
								offset = next_offset;
								
								// after if (offset < next_offset)
								_this._DEBUG_LOG(_this + ': part5 after read OnChunk');
								_this.OnChunk(_this.buffer_.toString('utf8', chunk_offset, chunk_offset + chunk_length));
								next_line_offset = next_offset;
								
								// after if (!first_line_parsed)
								current_line_offset = next_line_offset;
								
								// continue while2
								part2();
							}, finish);
							return;
						}
						_this._DEBUG_LOG(_this + ': part5 offset >= next_offset OnChunk');
						_this.OnChunk(_this.buffer_.toString('utf8', chunk_offset, chunk_offset + chunk_length));
						next_line_offset = next_offset;
					}
				}
			}
			else if (!line_is_blank) {
				_this._DEBUG_LOG(_this + ': part5 else !line_is_blank',
					'current_line_offset ===', current_line_offset);
				
				var p = strstr(_this.buffer_, kHeaderKeyValueSeparator, current_line_offset);
				
				_this._DEBUG_LOG(_this + ': part5 else !line_is_blank',
					'p ===', p);
				
				if (p >= 0) {
					// We cannot end the string with '\0' so we have to track indexes.
					//_this.buffer_[p] = '\0';
					var key = _this.buffer_.slice(current_line_offset, p).toString('utf8');
					var value = _this.buffer_.slice(p + kHeaderKeyValueSeparatorLength, next_crlf_ptr).toString('utf8');
					
					_this._DEBUG_LOG(_this + ': part5 else !line_is_blank p >= 0 OnHeader',
						'key ===', inspect(key),
						'value ===', inspect(value));
					
					_this.OnHeader(key, value);
					
					if (key === kContentLengthHeaderKey) {
						body_length = parseInt(value, 10);
					}
					else if (key === kTransferEncodingHeaderKey) {
						if (value === kTransferEncodingChunkedValue) {
							_this._DEBUG_LOG(_this + ': part5 else !line_is_blank -> chunked_transfer_encoding');
							
							chunked_transfer_encoding = true;
						}
					}
				}
			}
			else {
				_this._DEBUG_LOG(_this + ': part5 else');
				
				if (!chunked_transfer_encoding) {
					_this._DEBUG_LOG(_this + ': part5 else !chunked_transfer_encoding');
					
					body_offset = next_line_offset;
					if (body_length !== UINT_MAX) {
						length_cap = body_offset + body_length;
						if (length_cap + 1 > _this.buffer_.length) {
							var delta_size = length_cap + 1 - _this.buffer_.length;
							var buffer_new_length = Math.min(delta_size, buffer_max_growth_due_to_content_length);
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
					_this._DEBUG_LOG(_this + ': part5 else -> receiving_body_in_chunks');
					
					receiving_body_in_chunks = true;
				}
			}
			current_line_offset = next_line_offset;
			
			_this._DEBUG_LOG(_this + ': part5 continue while3',
				'current_line_offset ===', current_line_offset);
			
			// continue while3
			part4();
		}
	})();
}
/* istanbul ignore next: unused method */
TemplatedHTTPRequestData.prototype.Method = function () {
	return this.method_;
};
/* istanbul ignore next: unused method */
TemplatedHTTPRequestData.prototype.URL = function () {
	return this.url_;
};
TemplatedHTTPRequestData.prototype.RawPath = function () {
	return this.raw_path_;
};
TemplatedHTTPRequestData.prototype.HasBody = function () {
	return (this.body_buffer_begin_ !== null || this.chunked_body_buffer_ !== null);
};
TemplatedHTTPRequestData.prototype.Body = function () {
	var _this = this;
	if (!_this.prepared_body_) {
		if (_this.body_buffer_begin_ !== null) {
			_this.prepared_body_ = _this.buffer_.toString('utf8', _this.body_buffer_begin_, _this.body_buffer_end_);
		}
		else if (_this.chunked_body_buffer_ !== null) {
			_this.prepared_body_ = _this.chunked_body_buffer_;
		}
		else {
			throw HTTPNoBodyProvidedException();
		}
	}
	return _this.prepared_body_;
};
TemplatedHTTPRequestData.prototype.BodyBegin = cppHelpers.makeNotImplementedMethod();
TemplatedHTTPRequestData.prototype.BodyEnd = cppHelpers.makeNotImplementedMethod();
/* istanbul ignore next: unused method */
TemplatedHTTPRequestData.prototype.BodyLength = function () {
	var _this = this;
	if (_this.body_buffer_begin_ !== null) {
		return (_this.body_buffer_end_ - _this.body_buffer_begin_);
	}
	else if (_this.chunked_body_buffer_ !== null) {
		return _this.chunked_body_buffer_.length;
	}
	else {
		throw HTTPNoBodyProvidedException();
	}
};
TemplatedHTTPRequestData.prototype.OnHeader = cppHelpers.makeVirtualMethod();
TemplatedHTTPRequestData.prototype.OnChunk = cppHelpers.makeVirtualMethod();
TemplatedHTTPRequestData.prototype.OnChunkedBodyDone = cppHelpers.makeVirtualMethod();


function HTTPRequestData() {
	TemplatedHTTPRequestData.apply(this, arguments);
	
	var _this = this;
	
	Object.defineProperties(_this, {
		toString: {
			configurable: true,
			enumerable: false,
			value: function () {
				return 'HTTPRequestData';
			}
		},
		
		// private:
		headers_: {
			enumerable: false,
			writable: true,
			value: {}
		},
		body_: {
			enumerable: false,
			writable: true,
			value: ""
		}
	});
}
inherits(HTTPRequestData, TemplatedHTTPRequestData);
HTTPRequestData.prototype.headers = function () {
	return this.headers_;
};
HTTPRequestData.prototype.OnHeader = function (key, value) {
	this.headers_[key] = value;
};
HTTPRequestData.prototype.OnChunk = function (chunk) {
	this.body_ += chunk;
};
HTTPRequestData.prototype.OnChunkedBodyDone = function () {
	return this.body_;
};


function ChunkedResponseSender(connection, _headersSentPromise) {
	if (!(this instanceof ChunkedResponseSender)) {
		return new ChunkedResponseSender(connection, _headersSentPromise);
	}
	
	var _this = this;
	
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
				return 'HTTPServerConnection(' + _this.connection_ + ')';
			}
		},
		destroy: {
			configurable: true,
			enumerable: false,
			value: function () {
				if (!_this._destroyed) {
					_this._destroyed = true;
					_this._promise = when(_this._promise)
						.then(function () {
							return _this.connection_.BlockingWrite("0", true);
						})
						.then(function () {
							return _this.connection_.BlockingWrite(kCRLF, false);
						});
				}
				return _this._promise;
			}
		},
		
		// private:
		connection_: {
			enumerable: false,
			value: connection
		},
		
		_promise: {
			enumerable: false,
			writable: true,
			value: _headersSentPromise
		},
		_destroyed: {
			enumerable: false,
			writable: true,
			value: false
		}
	});
}
ChunkedResponseSender.prototype.Send = function (data) {
	var _this = this;
	
	function SendImpl(data) {
		if (data) {
			_this._promise = when(_this._promise)
				.then(function () {
					return _this.connection_.BlockingWrite(data.length.toString(16), true);
				})
				.then(function () {
					return _this.connection_.BlockingWrite(kCRLF, true);
				})
				.then(function () {
					return _this.connection_.BlockingWrite(data, true);
				})
				.then(function () {
					// Force every chunk to be sent out. This makes the demo dashboads smoother.
					return _this.connection_.BlockingWrite(kCRLF, false);
				});
		}
		return _this._promise;
	}
	
	return cppArguments.assert('ChunkedResponseSender#Send', [
		[
			cppArguments.assertion('string', 'const std::string&', 'data'),
			function (data) {
				return SendImpl(data);
			}
		],
		[
			cppArguments.assertion('object', 'T&&', 'object'),
			function (object) {
				return SendImpl(require('./bricks-json').JSON(object) + '\n');
			}
		],
		[
			cppArguments.assertion('object', 'T&&', 'object'),
			cppArguments.assertion('string', 'const std::string&', 'name'),
			function (object, name) {
				return SendImpl(require('./bricks-json').JSON(object, name) + '\n');
			}
		]
	], arguments);
};


var ConnectionClose = { ConnectionClose: 1 };
var ConnectionKeepAlive = { ConnectionKeepAlive: 1 };

function HTTPServerConnection(connection) {
	if (!(this instanceof HTTPServerConnection)) {
		return new HTTPServerConnection(connection);
	}
	
	var _this = this;
	
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
				return 'HTTPServerConnection(' + _this.connection_ + ')';
			}
		},
		destroy: {
			configurable: true,
			enumerable: false,
			value: function () {
				_this._DEBUG_LOG(_this + '#destroy.');
				
				return when.resolve()
					.then(function () {
						if (_this.chunked_response_sender_) {
							return _this.chunked_response_sender_.destroy();
						}
					})
					.then(function () {
						if (!_this.responded_) {
							return _this.SendHTTPResponse(
								DefaultInternalServerErrorMessage(), HTTPResponseCode.InternalServerError, "text/html");
						}
					})
					.done(undefined, function (err) {
						_this._DEBUG_LOG(_this + '#destroy: Error:', err);
					});
			}
		},
		
		// private:
		connection_: {
			enumerable: false,
			value: connection
		},
		responded_: {
			enumerable: false,
			writable: true,
			value: false
		},
		message_: {
			enumerable: false,
			value: new HTTPRequestData(connection)
		},
		chunked_response_sender_: {
			enumerable: false,
			writable: true,
			value: null
		}
	});
}
HTTPServerConnection.DefaultContentType = function () {
	return "text/plain";
};
HTTPServerConnection.DefaultJSONContentType = function () {
	return "application/json; charset=utf-8";
};
HTTPServerConnection.DefaultJSONHTTPHeaders = function () {
	return HTTPHeaders().Set("Access-Control-Allow-Origin", "*");
};
HTTPServerConnection.PrepareHTTPResponseHeader = function (
	connection_type,
	code,
	content_type,
	extra_headers
) {
	code = (typeof code === 'undefined' ? HTTPResponseCode.OK : code);
	content_type = (typeof content_type === 'undefined' ? HTTPServerConnection.DefaultContentType() : content_type);
	extra_headers = (typeof extra_headers === 'undefined' ? HTTPHeaders() : extra_headers);
	
	var os = '';
	
	os += "HTTP/1.1 " + code;
	os += " " + HTTPResponseCodeAsString(code) + kCRLF;
	os += "Content-Type: " + content_type + kCRLF;
	os += "Connection: " + (connection_type === ConnectionKeepAlive ? "keep-alive" : "close") + kCRLF;
	extra_headers.headers.forEach(function (cit) {
		os += cit.first + ": " + cit.second + kCRLF;
	});
	
	return os;
};
HTTPServerConnection.prototype.SendHTTPResponse = function (
	body,
	code,
	content_type,
	extra_headers
) {
	var _this = this;
	
	function SendHTTPResponseImpl(
		body,
		code,
		content_type,
		extra_headers
	) {
		if (_this.responded_) {
			throw AttemptedToSendHTTPResponseMoreThanOnce();
		}
		else {
			_this.responded_ = true;
			
			var headers = HTTPServerConnection.PrepareHTTPResponseHeader(
				ConnectionClose,
				code,
				content_type,
				extra_headers
			);
			
			headers += "Content-Length: " + body.length + kCRLF + kCRLF;
			
			return when(_this.connection_.BlockingWrite(headers)).then(function () {
				return _this.connection_.BlockingWrite(body);
			});
		}
	}
	
	return cppArguments.assert('HTTPServerConnection#SendHTTPResponse', [
		[
			cppArguments.assertion('string', 'const std::string&', 'body'),
			cppArguments.assertion('int', 'HTTPResponseCodeValue', 'code', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion('string', 'const std::string&', 'content_type', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeadersType&', 'extra_headers', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (
				body,
				code,
				content_type,
				extra_headers
			) {
				code = (typeof code === 'undefined' ? HTTPResponseCode.OK : code);
				content_type = (typeof content_type === 'undefined' ? HTTPServerConnection.DefaultContentType() : content_type);
				extra_headers = (typeof extra_headers === 'undefined' ? HTTPHeaders() : extra_headers);
				
				return SendHTTPResponseImpl(
					body,
					code,
					content_type,
					extra_headers
				);
			}
		],
		[
			cppArguments.assertion('object', 'T&&', 'object'),
			cppArguments.assertion('int', 'HTTPResponseCodeValue', 'code', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion('string', 'const std::string&', 'content_type', cppArguments.ASSERTION_MODE_OPTIONAL),
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPHeaders);
			}, 'const HTTPHeadersType&', 'extra_headers', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (
				object,
				code,
				content_type,
				extra_headers
			) {
				code = (typeof code === 'undefined' ? HTTPResponseCode.OK : code);
				content_type = (typeof content_type === 'undefined' ? HTTPServerConnection.DefaultJSONContentType() : content_type);
				extra_headers = (typeof extra_headers === 'undefined' ? HTTPServerConnection.DefaultJSONHTTPHeaders() : extra_headers);
				
				return SendHTTPResponseImpl(
					require('./bricks-json').JSON(object) + '\n',
					code,
					content_type,
					extra_headers
				);
			}
		]
	], arguments);
};
HTTPServerConnection.prototype.SendChunkedHTTPResponse = function (
	code,
	content_type,
	extra_headers
) {
	var _this = this;
	
	var code = (typeof code === 'undefined' ? HTTPResponseCode.OK : code);
	var content_type = (typeof content_type === 'undefined' ? HTTPServerConnection.DefaultContentType() : content_type);
	var extra_headers = (typeof extra_headers === 'undefined' ? HTTPHeaders() : extra_headers);
	
	if (_this.responded_) {
		throw AttemptedToSendHTTPResponseMoreThanOnce();
	}
	else {
		_this.responded_ = true;
		
		var headers = HTTPServerConnection.PrepareHTTPResponseHeader(
			ConnectionKeepAlive,
			code,
			content_type,
			extra_headers
		);
		
		headers += "Transfer-Encoding: chunked" + kCRLF + kCRLF;
		
		// Have to pass the promise for the headers to the `ChunkedResponseSender`
		// to be able to return the `ChunkedResponseSender` API without wrapping it
		// with `when(...).then(...)`.
		_this.chunked_response_sender_ = ChunkedResponseSender(_this.connection_,
			_this.connection_.BlockingWrite(headers));
		
		return _this.chunked_response_sender_;
	}
};
HTTPServerConnection.prototype.DoNotSendAnyResponse = function () {
	if (this.responded_) {
		throw AttemptedToSendHTTPResponseMoreThanOnce();
	}
	this.responded_ = true;
};
HTTPServerConnection.prototype.HTTPRequest = function () { return this.message_; };
HTTPServerConnection.prototype.RawConnection = function () { return this.connection_; };


exports.HTTPRequestData = HTTPRequestData;

exports.HTTPServerConnection = HTTPServerConnection;
exports.ConnectionClose = ConnectionClose;
exports.ConnectionKeepAlive = ConnectionKeepAlive;
