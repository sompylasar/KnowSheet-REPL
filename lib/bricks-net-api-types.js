'use strict';

var fs = require('fs');
var util = require('util');
var inherits = require('util').inherits;
var net = require('net');

var when = require('when');
var whenPipeline = require('when/pipeline');

var cppArguments = require('./cpp-arguments');
var promiseHelpers = require('./promise-helpers');

var HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;

var BRICKS_THROW = require('./bricks-throw');
var HTTPNoBodyProvidedException = require('./bricks-net-exceptions').HTTPNoBodyProvidedException;
var HTTPRedirectNotAllowedException = require('./bricks-net-exceptions').HTTPRedirectNotAllowedException;
var HTTPRedirectLoopException = require('./bricks-net-exceptions').HTTPRedirectLoopException;
var ConnectionResetByPeer = require('./bricks-net-exceptions').ConnectionResetByPeer;

var URL = require('./bricks-net-url').URL;


function virtualMethod() {
	/* istanbul ignore next */
	return function () {
		throw new Error('VIRTUAL METHOD');
	};
}
function notImplementedMethod() {
	/* istanbul ignore next */
	return function () {
		throw new Error('NOT IMPLEMENTED METHOD');
	};
}


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
		[ cppArguments.assertion('bool', 'bool', 'allow_redirects_setting', cppArguments.ASSERTION_MODE_OPTIONAL) ]
	], arguments);
	
	if (typeof allow_redirects_setting === 'undefined') {
		allow_redirects_setting = true;
	}
	
	this.allow_redirects = allow_redirects_setting;
	
	return this;
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


function POST(url) {
	var _this = this;
	
	if (!(_this instanceof POST)) {
		// HACK: Cannot use `apply` to call a constructor with the exact number of arguments.
		switch (arguments.length) {
			case 0:
				// HACK: We know `POST` `cppArguments.assert` will throw on this.
				_this = new POST();
				/* istanbul ignore next: previous statement should throw */ break;
		
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
				/* istanbul ignore next: previous statement should throw */ break;
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
	var _this = this;
	
	// The final URL. Will be equal to the original URL, unless redirects have been allowed and took place.
	_this.url = "";
	// HTTP response code.
	_this.code = 0;
	
	promiseHelpers.makeThenable(_this);
	promiseHelpers.makeThenableProperty(_this, 'url');
	promiseHelpers.makeThenableProperty(_this, 'code');
}

function HTTPResponseWithBuffer() {
	HTTPResponse.call(this);
	
	this.body = "";
	
	promiseHelpers.makeThenableProperty(this, 'body');
}
inherits(HTTPResponseWithBuffer, HTTPResponse);

function HTTPResponseWithResultingFileName() {
	HTTPResponse.call(this);
	
	// The file name into which the returned HTTP body has been saved.
	this.body_file_name = "";
	
	promiseHelpers.makeThenableProperty(this, 'body_file_name');
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
	if (!(this instanceof SaveResponseToFile)) {
		return new SaveResponseToFile(file_name);
	}
	
	var _this = this;
	
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


function TemplatedHTTPRequestData(socket) {
	var _this = this;
	
	_this._DEBUG_LOG = function () {};
	//_this._DEBUG_LOG = function () { console.log.apply(console, arguments); };
	
	_this._socket = socket;
	
	_this.method_ = "";
	_this.url_ = "";
	_this.raw_path_ = "";
	
	_this.body_buffer_begin_ = null;
	_this.body_buffer_end_ = null;
	
	_this.chunked_body_buffer_ = null;
	
	promiseHelpers.makeThenable(_this);
	
	// Read the response right in the constructor (like in the original code, but async).
	(function () {
		_this._DEBUG_LOG('TemplatedHTTPRequestData: Begin.');
		
		function strstr(buffer, str, start) {
			//_this._DEBUG_LOG('TemplatedHTTPRequestData strstr:',
			//	JSON.stringify(buffer.toString('utf8')),
			//	JSON.stringify(str),
			//	start
			//);
			
			var i, ic, j, jc;
			for (ic = buffer.length, i = start || 0; i < ic; ++i) {
				if (buffer[i] === 0) {
					break;
				}
				for (jc = str.length, j = 0; j < jc; ++j) {
					//_this._DEBUG_LOG('TemplatedHTTPRequestData strstr: ',
					//	i + j, buffer[i + j], j, str.charCodeAt(j), buffer[i + j] === str.charCodeAt(j));
					if (buffer[i + j] !== str.charCodeAt(j)) {
						break;
					}
				}
				if (j === jc) {
					//_this._DEBUG_LOG('TemplatedHTTPRequestData strstr: return ', i);
					return i;
				}
			}
			return -1;
		}
		
		
		var UINT_MAX = 4294967295;
		
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
		
		var kCRLF = "\r\n";
		var kCRLFLength = kCRLF.length;
		var kHeaderKeyValueSeparator = ": ";
		var kHeaderKeyValueSeparatorLength = kHeaderKeyValueSeparator.length;
		var kContentLengthHeaderKey = "Content-Length";
		var kTransferEncodingHeaderKey = "Transfer-Encoding";
		var kTransferEncodingChunkedValue = "chunked";
		
		
		_this._socket.on('data', onData);
		_this._socket.on('end', onEnd);
		_this._socket.on('error', onError);
		
		var readRequest = null;
		var internalBuffers = [];
		var internalBuffersLength = 0;
		var internalBuffersClosed = false;
		var internalError = null;
		var isFinished = false;
		
		function cleanup() {
			_this._socket.removeListener('data', onData);
			_this._socket.removeListener('end', onEnd);
			_this._socket.removeListener('error', onError);
			_this._socket.destroy();
			_this._socket = null;
			
			readRequest = null;
			internalBuffers = null;
		}
		
		function read(maxBytesToRead, fillFullBuffer) {
			if (isFinished) {
				throw new Error('TemplatedHTTPRequestData read: Finished.');
			}
			if (readRequest) {
				throw new Error('TemplatedHTTPRequestData read: Second read call.');
			}
			
			if (maxBytesToRead <= 0) {
				return when.resolve(0);
			}
			
			fillFullBuffer = !!fillFullBuffer;
			
			_this._DEBUG_LOG('TemplatedHTTPRequestData read:',
				'maxBytesToRead ===', maxBytesToRead,
				'fillFullBuffer ===', fillFullBuffer);
			
			var deferred = when.defer();
			
			readRequest = {
				maxBytesToRead: maxBytesToRead,
				fillFullBuffer: fillFullBuffer,
				deferred: deferred
			};
			
			consume();
			
			return deferred.promise;
		}
	
		function finish(err) {
			_this._DEBUG_LOG('TemplatedHTTPRequestData finish:', err);
			
			isFinished = true;
			
			cleanup();
			
			if (err) { return _this.resolver.reject(err); }
			_this.resolver.resolve(_this);
		}
	
		function consume() {
			if (!readRequest) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData consume: Not reading.');
				return;
			}
			
			if (internalError) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData consume:',
					'internalError ===', internalError
				);
				
				finish(internalError);
				return;
			}
			
			var ptr = offset;
			var bytesRead = 0;
			var remainingBytesToRead;
			var maxBytesToRead = readRequest.maxBytesToRead;
			var fillFullBuffer = readRequest.fillFullBuffer;
			var buffer;
			
			remainingBytesToRead = (maxBytesToRead - bytesRead);
			
			_this._DEBUG_LOG('TemplatedHTTPRequestData consume:',
				'maxBytesToRead ===', maxBytesToRead,
				'fillFullBuffer ===', fillFullBuffer,
				'bytesRead ===', bytesRead,
				'remainingBytesToRead ===', remainingBytesToRead,
				'internalBuffersLength ===', internalBuffersLength
			);
			
			if (internalBuffersLength > 0) {
				if (fillFullBuffer && !internalBuffersClosed && internalBuffersLength < maxBytesToRead) {
					// Not enough data to fill the full buffer.
					// Keep the readRequest for the next attempt.
					
					_this._DEBUG_LOG('TemplatedHTTPRequestData consume: wait',
						'maxBytesToRead ===', maxBytesToRead,
						'fillFullBuffer ===', fillFullBuffer,
						'bytesRead ===', bytesRead,
						'remainingBytesToRead ===', remainingBytesToRead,
						'internalBuffersLength ===', internalBuffersLength
					);
					
					return;
				}
				
				// Fill the output buffer from the internal buffers.
				while (internalBuffersLength > 0 && bytesRead < maxBytesToRead) {
					buffer = internalBuffers[0];
					var bytesReadThisTime = Math.min(remainingBytesToRead, buffer.length, internalBuffersLength);
					buffer.copy(_this.buffer_, ptr, 0, bytesReadThisTime);
					ptr += bytesReadThisTime;
					bytesRead += bytesReadThisTime;
					remainingBytesToRead = (maxBytesToRead - bytesRead);
					if (bytesReadThisTime < buffer.length) {
						internalBuffers[0] = buffer.slice(bytesReadThisTime);
					}
					else {
						internalBuffers.shift();
					}
					internalBuffersLength -= bytesReadThisTime;
				}
			}
			
			if (bytesRead > 0 || internalBuffersClosed) {
				// Have written to the buffer, the read should return the data length.
				
				_this._DEBUG_LOG('TemplatedHTTPRequestData consume: resolve', 
					'maxBytesToRead ===', maxBytesToRead,
					'fillFullBuffer ===', fillFullBuffer,
					'bytesRead ===', bytesRead,
					'remainingBytesToRead ===', remainingBytesToRead,
					'internalBuffersLength ===', internalBuffersLength
				);
				
				var deferred = readRequest.deferred;
				readRequest = null;
				deferred.resolve(bytesRead);
			}
			else {
				// Keep the readRequest for the next attempt.
				
				_this._DEBUG_LOG('TemplatedHTTPRequestData consume: wait', 
					'maxBytesToRead ===', maxBytesToRead,
					'fillFullBuffer ===', fillFullBuffer,
					'bytesRead ===', bytesRead,
					'remainingBytesToRead ===', remainingBytesToRead,
					'internalBuffersLength ===', internalBuffersLength
				);
				
				return;
			}
		}
		
		
		function onData(data) {
			_this._DEBUG_LOG('TemplatedHTTPRequestData onData:', data.toString('utf8'));
			
			// Collect the data as it comes until it is explicitly read.
			internalBuffers.push(data);
			internalBuffersLength += data.length;
			
			consume();
		}
		
		function onEnd() {
			_this._DEBUG_LOG('TemplatedHTTPRequestData onEnd.');
			
			// Connection has closed, the next read should return zero bytes.
			internalBuffersClosed = true;
			
			consume();
		}
		
		function onError(err) {
			_this._DEBUG_LOG('TemplatedHTTPRequestData onError:', err);
			
			// An error occurred, the next read should result in an exception.
			internalError = err;
			
			consume();
		}
		
		
		// The algorithm is broken into async parts.
		part1();
		
		function part1() {
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part1');
			
			// while1
			if (offset < length_cap) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part1 begin while1');
			
				part2();
			}
			// end while1
			else {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part1 end while1');
				
				if (body_length !== UINT_MAX) {
					_this.body_buffer_begin_ = body_offset;
					_this.body_buffer_end_ = _this.body_buffer_begin_ + body_length;
				}
				
				finish();
			}
		}
		
		function part2() {
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part2');
			
			// while2
			var chunk = _this.buffer_.length - offset - 1;
			when(read(chunk)).done(function (read_count) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part2 while2 after read',
					'read_count ===', read_count);
				
				part3(chunk, read_count);
			}, finish);
		}
		
		function part3(chunk, read_count) {
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part3 while2 after read');
			
			offset += read_count;
			if (read_count === chunk && offset < length_cap) {
				_this.buffer_ = Buffer.concat([
					_this.buffer_,
					new Buffer(Math.floor(_this.buffer_.length * buffer_growth_k) - _this.buffer_.length)
				], Math.floor(_this.buffer_.length * buffer_growth_k));
				
				// continue while2
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part3 continue while2');
				part2();
				return;
			}
			
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part3 finish while2',
				'read_count ===', read_count);
			
			if (!read_count) {
				finish(ConnectionResetByPeer());
				return;
			}
			
			_this.buffer_[offset] = '\0';
			
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part3 start while3');
			
			// start while3
			part4();
		}
		
		function part4() {
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part4');
			
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part4:', [
				offset, body_offset, current_line_offset
			]);
			
			// while3
			var next_crlf_ptr;
			if (
				(body_offset === UINT_MAX || offset < body_offset) &&
				(next_crlf_ptr = strstr(_this.buffer_, kCRLF, current_line_offset)) >= 0
			) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part4 begin while3',
					'next_crlf_ptr ===', next_crlf_ptr);
				
				part5(next_crlf_ptr);
			}
			// end while3
			else {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part4 end while3');
				
				// continue while1
				part1();
			}
		}
		
		function part5(next_crlf_ptr) {
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part5',
				'next_crlf_ptr ===', next_crlf_ptr);
			
			var line_is_blank = (next_crlf_ptr === current_line_offset);
			// We cannot end the string with '\0' so we have to track indexes.
			//_this.buffer_[next_crlf_ptr] = '\0';
			var next_line_offset = next_crlf_ptr + kCRLFLength;
			if (!first_line_parsed) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 !first_line_parsed');
				
				if (!line_is_blank) {
					_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 !first_line_parsed !line_is_blank');
					
					var line = _this.buffer_.toString('utf8', current_line_offset, next_crlf_ptr);
					var pieces = line.split(/\s+/g);
					if (pieces.length >= 1) {
						_this.method_ = pieces[0];
					}
					if (pieces.length >= 2) {
						_this.raw_path_ = pieces[1];
						_this.url_ = URL(_this.raw_path_);
					}
					
					_this._DEBUG_LOG('TemplatedHTTPRequestData: part5',
						'line ===', JSON.stringify(line),
						'pieces ===', pieces);
					
					first_line_parsed = true;
				}
			}
			else if (receiving_body_in_chunks) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 receiving_body_in_chunks');
				
				if (!line_is_blank) {
					_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 receiving_body_in_chunks !line_is_blank');
					
					var chunk_length = parseInt(_this.buffer_.toString('utf8', current_line_offset, next_line_offset), 16);
					if (chunk_length === 0) {
						_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 OnChunkedBodyDone');
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
							when(read(bytes_to_read, true)).done(function (read_count) {
								if (bytes_to_read !== read_count) {
									finish(ConnectionResetByPeer());
									return;
								}
								offset = next_offset;
								
								// after if (offset < next_offset)
								_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 after read OnChunk');
								_this.OnChunk(_this.buffer_.toString('utf8', chunk_offset, chunk_offset + chunk_length));
								next_line_offset = next_offset;
								
								// after if (!first_line_parsed)
								current_line_offset = next_line_offset;
								
								// continue while2
								part2();
							}, finish);
							return;
						}
						_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 offset >= next_offset OnChunk');
						_this.OnChunk(_this.buffer_.toString('utf8', chunk_offset, chunk_offset + chunk_length));
						next_line_offset = next_offset;
					}
				}
			}
			else if (!line_is_blank) {
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 else !line_is_blank',
					'current_line_offset ===', current_line_offset);
				
				var p = strstr(_this.buffer_, kHeaderKeyValueSeparator, current_line_offset);
				
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 else !line_is_blank',
					'p ===', p);
				
				if (p >= 0) {
					// We cannot end the string with '\0' so we have to track indexes.
					//_this.buffer_[p] = '\0';
					var key = _this.buffer_.slice(current_line_offset, p).toString('utf8');
					var value = _this.buffer_.slice(p + kHeaderKeyValueSeparatorLength, next_crlf_ptr).toString('utf8');
					
					_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 else !line_is_blank p >= 0 OnHeader',
						'key ===', JSON.stringify(key),
						'value ===', JSON.stringify(value));
					
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
				_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 else');
				
				if (!chunked_transfer_encoding) {
					_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 else !chunked_transfer_encoding');
					
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
					_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 else -> receiving_body_in_chunks');
					
					receiving_body_in_chunks = true;
				}
			}
			current_line_offset = next_line_offset;
			
			_this._DEBUG_LOG('TemplatedHTTPRequestData: part5 continue while2',
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
			BRICKS_THROW(HTTPNoBodyProvidedException());
		}
	}
	return _this.prepared_body_;
};
TemplatedHTTPRequestData.prototype.BodyBegin = notImplementedMethod();
TemplatedHTTPRequestData.prototype.BodyEnd = notImplementedMethod();
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
		BRICKS_THROW(HTTPNoBodyProvidedException());
	}
};
TemplatedHTTPRequestData.prototype.OnHeader = virtualMethod();
TemplatedHTTPRequestData.prototype.OnChunk = virtualMethod();
TemplatedHTTPRequestData.prototype.OnChunkedBodyDone = virtualMethod();


function HTTPDefaultRequestData() {
	TemplatedHTTPRequestData.apply(this, arguments);
	
	this.headers_ = {};
	this.body_ = "";
}
inherits(HTTPDefaultRequestData, TemplatedHTTPRequestData);
HTTPDefaultRequestData.prototype.headers = function () {
	return this.headers_;
};
HTTPDefaultRequestData.prototype.OnHeader = function (key, value) {
	this.headers_[key] = value;
};
HTTPDefaultRequestData.prototype.OnChunk = function (chunk) {
	this.body_ += chunk;
};
HTTPDefaultRequestData.prototype.OnChunkedBodyDone = function () {
	return this.body_;
};


function HTTPRedirectableRequestData() {
	HTTPDefaultRequestData.apply(this, arguments);
	
	this.location = "";
}
inherits(HTTPRedirectableRequestData, HTTPDefaultRequestData);
HTTPRedirectableRequestData.prototype.OnHeader = function (key, value) {
	HTTPDefaultRequestData.prototype.OnHeader.apply(this, arguments);
	if ("Location" === key) {
		this.location = value;
	}
};


function HTTPClient() {
	var _this = this;
	
	_this._DEBUG_LOG = function () {};
	//_this._DEBUG_LOG = function () { console.log.apply(console, arguments); };
	
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
	
	promiseHelpers.makeThenable(_this);
	
	// Performs an HTTP request and calls itself if a redirect is received.
	// Called once from HTTPClient#Go() method.
	_this._performRequest = function () {
		_this._DEBUG_LOG('HTTPClient#_performRequest: Begin.');
			
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
			writes.push("\r\n");
			writes.push(_this.request_body_contents_);
		}
		else {
			writes.push("\r\n");
		}
		
		var sequence = [];
		
		var socket;
		
		function cleanup() {
			_this._DEBUG_LOG('HTTPClient#_performRequest: Cleanup.');
			
			if (socket) {
				socket.destroy();
				socket = null;
			}
		}
		
		function finish(err) {
			_this._DEBUG_LOG('HTTPClient#_performRequest: Finish:', err || 'OK');
			
			cleanup();
			
			if (err) { return _this.resolver.reject(err); }
			_this.resolver.resolve(_this);
		}
		
		var promise = when.promise(function (resolve, reject) {
			_this._DEBUG_LOG('HTTPClient#_performRequest: Connect:',
				_this.parsed_url_.host, _this.parsed_url_.port);
			
			socket = new net.Socket();
			
			socket.connect({
				host:  _this.parsed_url_.host,
				port:  _this.parsed_url_.port
			}, function (err) {
				_this._DEBUG_LOG('HTTPClient#_performRequest: Connect callback:', err || 'OK');
				
				if (err) { return reject(err); }
				resolve();
			});
		});
		
		function writeNext() {
			var chunk = writes.shift();
			
			return when.promise(function (resolve, reject) {
				_this._DEBUG_LOG('HTTPClient#_performRequest: Write:', JSON.stringify(chunk));
				
				socket.write(chunk, 'utf8', function (err) {
					_this._DEBUG_LOG('HTTPClient#_performRequest: Write callback:', err || 'OK');
					
					if (err) { return reject(err); }
					resolve();
				});
			});
		}
		
		writes.forEach(function () {
			promise = promise.then(writeNext);
		});
		
		promise = promise.then(function () {
			_this._DEBUG_LOG('HTTPClient#_performRequest: new HTTPRedirectableRequestData');
			
			_this.http_request_ = new HTTPRedirectableRequestData(socket);
			
			return _this.http_request_;
		});
		
		promise = promise.then(function () {
			var response_code_as_int = parseInt(_this.http_request_.RawPath(), 10);
			
			_this._DEBUG_LOG('HTTPClient#_performRequest: Parsing response code:', response_code_as_int);
			
			_this.response_code_ = HTTPResponseCode(response_code_as_int);
			
			if (response_code_as_int >= 300 && response_code_as_int <= 399 && _this.http_request_.location) {
				_this._DEBUG_LOG('HTTPClient#_performRequest: Got a redirect:', _this.http_request_.location);
				
				// Note: This is by no means a complete redirect implementation.
				_this.parsed_url_ = URL(_this.http_request_.location, _this.parsed_url_);
				_this.response_url_after_redirects_ = _this.parsed_url_.ComposeURL();
				
				// Close the current socket before sending the next request.
				cleanup();
				
				return _this._performRequest();
			}
			else {
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
		
		_this._DEBUG_LOG('HTTPClient#Go:', _this.parsed_url_.ComposeURL());
		
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
	if (!(output instanceof HTTPResponse)) {
		throw new Error('Argument "output" must be HTTPResponse, ' + (typeof output) + ' given.');
	}
	
	when(response).then(function () {
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


function HTTP() {
	var _this = this;
	var retval;
	
	cppArguments.assert('HTTP', [
		[
			cppArguments.assertion(function (value) {
				return (value instanceof HTTPRequestBase);
			}, 'const T_REQUEST_PARAMS&', 'request_params'),
			cppArguments.assertion(function (value) {
				return (
					(value instanceof KeepResponseInMemory)
					|| (value instanceof SaveResponseToFile)
				);
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
				
				impl.Go();
				
				ParseOutput(request_params, response_params, impl, output);
				
				retval = output;
			}
		],
	], arguments);
	
	return retval;
}


exports.URL = URL;

exports.GET = GET;
exports.POST = POST;
exports.POSTFromFile = POSTFromFile;
exports.HTTP = HTTP;

exports.HTTPResponse = HTTPResponse;

exports.KeepResponseInMemory = KeepResponseInMemory;
exports.SaveResponseToFile = SaveResponseToFile;
