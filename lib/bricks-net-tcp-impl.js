'use strict';

var net = require('net');

var when = require('when');

var promiseHelpers = require('./promise-helpers');


function Connection(socket) {
	if (!(this instanceof Connection)) {
		return new Connection(socket);
	}
	
	var _this = this;
	
	var _socket = socket;
	var _socketString = _socket.remoteAddress + ':' + _socket.remotePort;
	
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
				return 'Connection(' + _socketString + ')';
			}
		},
		destroy: {
			configurable: true,
			enumerable: false,
			value: function () {
				_this._DEBUG_LOG(_this + ' destroy.');
			
				_finish();
			}
		}
	});
	
	_socket.on('data', _onData);
	_socket.on('end', _onEnd);
	_socket.on('error', _onError);
	
	var _readRequest = null;
	var _internalBuffers = [];
	var _internalBuffersLength = 0;
	var _internalBuffersClosed = false;
	var _internalError = null;
	var _isFinished = false;
	
	
	function _cleanup() {
		if (_socket) {
			_socket.removeListener('data', _onData);
			_socket.removeListener('end', _onEnd);
			_socket.removeListener('error', _onError);
			_socket.destroy();
			_socket = null;
		}
		
		_readRequest = null;
		_internalBuffers = null;
		_internalBuffersLength = 0;
		_internalBuffersClosed = true;
		_internalError = null;
		_isFinished = true;
	}
	
	function _finish(err) {
		_this._DEBUG_LOG(_this + ' finish:', (err || 'OK'));
		
		if (_readRequest) {
			_internalError = new Error('Destroying.');
			_consume();
		}
		
		_cleanup();
	}
	
	function _consume() {
		if (_isFinished) {
			throw new Error(_this + ' _consume: Finished.');
		}
		
		if (!_readRequest) {
			_this._DEBUG_LOG(_this + ' _consume: Not reading.');
			return;
		}
		
		if (_internalError) {
			_this._DEBUG_LOG(_this + ' _consume:',
				'_internalError ===', _internalError
			);
			
			_finish(_internalError);
			return;
		}
		
		var outputBuffer = _readRequest.buffer;
		var ptr = _readRequest.offset;
		var bytesRead = 0;
		var remainingBytesToRead;
		var maxBytesToRead = _readRequest.maxBytesToRead;
		var fillFullBuffer = _readRequest.fillFullBuffer;
		var buffer;
		
		remainingBytesToRead = (maxBytesToRead - bytesRead);
		
		_this._DEBUG_LOG(_this + ' _consume:',
			'maxBytesToRead ===', maxBytesToRead,
			'fillFullBuffer ===', fillFullBuffer,
			'bytesRead ===', bytesRead,
			'remainingBytesToRead ===', remainingBytesToRead,
			'_internalBuffersLength ===', _internalBuffersLength
		);
		
		if (_internalBuffersLength > 0) {
			if (fillFullBuffer && !_internalBuffersClosed && _internalBuffersLength < maxBytesToRead) {
				// Not enough data to fill the full buffer.
				// Keep the _readRequest for the next attempt.
				
				_this._DEBUG_LOG(_this + ' _consume: wait',
					'maxBytesToRead ===', maxBytesToRead,
					'fillFullBuffer ===', fillFullBuffer,
					'bytesRead ===', bytesRead,
					'remainingBytesToRead ===', remainingBytesToRead,
					'_internalBuffersLength ===', _internalBuffersLength
				);
				
				return;
			}
			
			// Fill the output buffer from the internal buffers.
			while (_internalBuffersLength > 0 && bytesRead < maxBytesToRead) {
				buffer = _internalBuffers[0];
				var bytesReadThisTime = Math.min(remainingBytesToRead, buffer.length, _internalBuffersLength);
				buffer.copy(outputBuffer, ptr, 0, bytesReadThisTime);
				ptr += bytesReadThisTime;
				bytesRead += bytesReadThisTime;
				remainingBytesToRead = (maxBytesToRead - bytesRead);
				if (bytesReadThisTime < buffer.length) {
					_internalBuffers[0] = buffer.slice(bytesReadThisTime);
				}
				else {
					_internalBuffers.shift();
				}
				_internalBuffersLength -= bytesReadThisTime;
			}
		}
		
		if (bytesRead > 0 || _internalBuffersClosed) {
			// Have written to the buffer, the _read should return the data length.
			
			_this._DEBUG_LOG(_this + ' _consume: resolve', 
				'maxBytesToRead ===', maxBytesToRead,
				'fillFullBuffer ===', fillFullBuffer,
				'bytesRead ===', bytesRead,
				'remainingBytesToRead ===', remainingBytesToRead,
				'_internalBuffersLength ===', _internalBuffersLength
			);
			
			var deferred = _readRequest.deferred;
			_readRequest = null;
			deferred.resolve(bytesRead);
		}
		else {
			// Keep the _readRequest for the next attempt.
			
			_this._DEBUG_LOG(_this + ' _consume: wait', 
				'maxBytesToRead ===', maxBytesToRead,
				'fillFullBuffer ===', fillFullBuffer,
				'bytesRead ===', bytesRead,
				'remainingBytesToRead ===', remainingBytesToRead,
				'_internalBuffersLength ===', _internalBuffersLength
			);
			
			return;
		}
	}
	
	
	function _onData(data) {
		_this._DEBUG_LOG(_this + ' _onData:', data.toString('utf8'));
		
		// Collect the data as it comes until it is explicitly read.
		_internalBuffers.push(data);
		_internalBuffersLength += data.length;
		
		_consume();
	}
	
	function _onEnd() {
		_this._DEBUG_LOG(_this + ' _onEnd.');
		
		// Connection has closed, the next _read should return zero bytes.
		_internalBuffersClosed = true;
		
		_consume();
	}
	
	function _onError(err) {
		_this._DEBUG_LOG(_this + ' _onError:', err);
		
		// An error occurred, the next _read should result in an exception.
		_internalError = err;
		
		_consume();
	}
	
	
	_this.BlockingRead = function (buffer, offset, maxBytesToRead, fillFullBuffer) {
		return when.promise(function (resolve, reject) {
			fillFullBuffer = !!fillFullBuffer;
			
			_this._DEBUG_LOG(_this + '#BlockingRead: Read:',
				'maxBytesToRead ===', maxBytesToRead,
				'fillFullBuffer ===', fillFullBuffer
			);
			
			if (_isFinished) {
				throw new Error(_this + '#BlockingRead: Finished.');
			}
			if (_readRequest) {
				throw new Error(_this + '#BlockingRead: Second call.');
			}
			
			if (maxBytesToRead <= 0) {
				resolve(0);
				return;
			}
			
			var deferred = when.defer();
			
			_readRequest = {
				buffer: buffer,
				offset: offset,
				maxBytesToRead: maxBytesToRead,
				fillFullBuffer: fillFullBuffer,
				deferred: deferred
			};
			
			_consume();
			
			deferred.promise.done(resolve, reject);
		});
	};
	
	_this.BlockingWrite = function (chunk) {
		return when.promise(function (resolve, reject) {
			_this._DEBUG_LOG(_this + '#BlockingWrite: Write: ' + require('util').inspect(chunk));
			
			_socket.write(chunk, 'utf8', function (err) {
				_this._DEBUG_LOG(_this + '#BlockingWrite: Write callback:', err || 'OK');
				
				if (err) { return reject(err); }
				resolve();
			});
		});
	};
}


function Socket(port) {
	if (!(this instanceof Socket)) {
		return new Socket(port);
	}
	
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
				return 'Socket(' + port + ')';
			}
		},
		destroy: {
			enumerable: false,
			value: function () {
				_this._DEBUG_LOG(_this + ' destroy.');
			
				_finish();
			}
		}
	});
	
	var _clientSockets = [];
	
	var _listenRequest = {};
	
	var _acceptRequest = null;
	var _acceptedSocket = null;
	var _internalError = null;
	var _isFinished = false;
	
	var _socket = new net.Server();
	var _port = port;
	
	_socket.ref();
	
	_socket.on('listening', _onListening);
	_socket.on('error', _onError);
	
	_socket.listen({
		port: _port
	});
	
	
	function _cleanup() {
		if (_socket) {
			_socket.removeListener('listening', _onListening);
			_socket.removeListener('connection', _onConnection);
			_socket.removeListener('error', _onError);
			_socket.close();
			_socket = null;
		}
		
		_listenRequest = null;
		
		_acceptRequest = null;
		_acceptedSocket = null;
		_internalError = null;
		_isFinished = true;
	}
	
	function _finish(err) {
		_this._DEBUG_LOG(_this + ' finish:', (err || 'OK'));
		
		if (_listenRequest || _acceptRequest) {
			_internalError = new Error('Destroying.');
			_consume();
		}
		
		_cleanup();
		
		if (err) { return _this.resolver.reject(err); }
		_this.resolver.resolve(_this);
	}
	
	function _consume() {
		if (_isFinished) {
			throw new Error(_this + ' _consume: Finished.');
		}
		
		if (_listenRequest) {
			if (_internalError) {
				var err = _internalError;
				
				_this._DEBUG_LOG(_this + ' _consume: Listening error:', err);
				
				_cleanup();
				
				_this.resolver.reject(err);
				return;
			}
			
			_this._DEBUG_LOG(_this + ' _consume: Listening success.');
			
			_listenRequest = null;
			
			_socket.removeListener('listening', _onListening);
			_socket.on('connection', _onConnection);
			
			_this.resolver.resolve(_this);
			return;
		}
		
		if (!_acceptRequest) {
			_this._DEBUG_LOG(_this + ' _consume: Not accepting.');
			return;
		}
		
		if (_internalError) {
			_this._DEBUG_LOG(_this + ' _consume:',
				'_internalError ===', _internalError
			);
			
			var deferred = _acceptRequest.deferred;
			_acceptRequest = null;
			deferred.reject(_internalError);
			return;
		}
		
		if (_acceptedSocket) {
			_this._DEBUG_LOG(_this + ' _consume:',
				'_acceptedSocket ===', _acceptedSocket
			);
			
			var deferred = _acceptRequest.deferred;
			_acceptRequest = null;
			deferred.resolve(Connection(_acceptedSocket));
		}
	}
	
	
	function _onListening() {
		_this._DEBUG_LOG(_this + ': Started listening.');
		
		_consume();
	}
	
	function _onConnection(socket) {
		var socketString = socket.remoteAddress + ':' + socket.remotePort;
		_this._DEBUG_LOG(_this + ': Got a connection:', socketString);
		
		_clientSockets.push(socket);
		socket.on('close', function () {
			_this._DEBUG_LOG(_this + ': Connection closed:', socketString);
			
			var index = _clientSockets.indexOf(socket);
			if (index >= 0) {
				_clientSockets.splice(index, 1);
			}
		});
		
		_acceptedSocket = socket;
		
		_consume();
	}
	
	function _onError(err) {
		_this._DEBUG_LOG(_this + ': Error:', err);
		
		// An error occurred, the next _read should result in an exception.
		_internalError = err;
		
		_consume();
	}
	
	
	_this.Accept = function () {
		if (_isFinished) {
			throw new Error(_this + ' accept: Finished.');
		}
		if (_acceptRequest) {
			throw new Error(_this + ' accept: Second call.');
		}
		
		var deferred = when.defer();
		
		_acceptRequest = {
			deferred: deferred
		};
		
		return deferred.promise;
	};
}


function ClientSocket(host, port) {
	if (!(this instanceof ClientSocket)) {
		return new ClientSocket(host, port);
	}
	
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
				return 'ClientSocket(' + host + ':' + port + ')';
			}
		}
	});
	
	var _socket = new net.Socket();
	
	_socket.connect({
		host:  host,
		port:  port
	}, function (err) {
		_this._DEBUG_LOG(_this + ': Connect callback:', err || 'OK');
		
		if (err) { return _this.resolver.reject(err); }
		_this.resolver.resolve(Connection(_socket));
	});
}


exports.Connection = Connection;
exports.Socket = Socket;
exports.ClientSocket = ClientSocket;
