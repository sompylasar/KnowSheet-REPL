'use strict';

var inherits = require('util').inherits;

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


var kCRLF = "\r\n";
var kCRLFLength = kCRLF.length;
var kHeaderKeyValueSeparator = ": ";
var kHeaderKeyValueSeparatorLength = kHeaderKeyValueSeparator.length;
var kContentLengthHeaderKey = "Content-Length";
var kTransferEncodingHeaderKey = "Transfer-Encoding";
var kTransferEncodingChunkedValue = "chunked";


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
	
	this.headers_ = {};
	this.body_ = "";
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


exports.HTTPRequestData = HTTPRequestData;
