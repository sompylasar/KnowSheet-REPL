var assert = require('assert');
var when = require('when');

describe('bricks-net-api', function () {
	var api = require('../lib/bricks-net-api');
	
	it('should export `GET` function', function () {
		assert.equal('function', typeof api.GET);
	});
	
	it('should export `POST` function', function () {
		assert.equal('function', typeof api.POST);
	});
	
	it('should export `POSTFromFile` function', function () {
		assert.equal('function', typeof api.POSTFromFile);
	});
	
	it('should export `HTTP` function', function () {
		assert.equal('function', typeof api.HTTP);
	});
	
	it('should export `HTTPResponse` function', function () {
		assert.equal('function', typeof api.HTTPResponse);
	});
	
	describe('`GET` function', function () {
		it('should return an instance of `GET` class', function () {
			assert.equal(true, api.GET("url") instanceof api.GET);
		});
	});
	
	describe('`POST` function', function () {
		it('should return an instance of `POST` class', function () {
			assert.equal(true, api.POST("url") instanceof api.POST);
		});
	});
	
	describe('`POSTFromFile` function', function () {
		it('should return an instance of `POSTFromFile` class', function () {
			assert.equal(true, api.POSTFromFile("url", __filename, "application/javascript") instanceof api.POSTFromFile);
		});
	});
	
	describe('`HTTP` function', function () {
		var KBYTES_IN_BYTES = 1000;
		var MBYTES_IN_BYTES = 1000 * KBYTES_IN_BYTES;
		var largeBodyLength = 50 * MBYTES_IN_BYTES;
		var largeBody;
		
		var http = require('http');
		var server;
		var sockets = [];
		
		var serverRequestHandler;
		
		var _DEBUG_LOG = function () {};
		//var _DEBUG_LOG = function () { _DEBUG_LOG.apply(console, arguments); };
		
		before(function () {
			largeBody = (new Array(largeBodyLength)).join('X');
		});
		
		beforeEach(function (done) {
			serverRequestHandler = function (request, response) {
				_DEBUG_LOG('TESTS: Ending the response...');
				
				response.end();
				
				_DEBUG_LOG('TESTS: Response ended.');
			};
			server = http.createServer();
			server.on('connection', function (socket) {
				var socketString = socket.remoteAddress + ':' + socket.remotePort;
				_DEBUG_LOG('TESTS: Server got a connection:', socketString);
				
				sockets.push(socket);
				socket.on('close', function () {
					_DEBUG_LOG('TESTS: Connection closed:', socketString);
					
					var index = sockets.indexOf(socket);
					if (index >= 0) {
						sockets.splice(index, 1);
					}
				});
			});
			server.on('request', function (request, response) {
				_DEBUG_LOG('TESTS: Got request:', request.method, request.url, request.httpVersion, '\n', request.headers);
				serverRequestHandler(request, response);
			});
			server.on('listening', function () {
				_DEBUG_LOG('TESTS: Server is listening.');
				done();
			});
			server.listen(20000);
		});
		afterEach(function (done) {
			_DEBUG_LOG('TESTS: Server is shutting down...');
			server.close(function () {
				_DEBUG_LOG('TESTS: Server has been shut down.');
				done();
			});
			while (sockets.length > 0) {
				sockets.shift().destroy();
			}
		});
		
		it('should make a `GET` request', function (done) {
			serverRequestHandler = function (request, response) {
				try {
					assert.equal('GET', request.method);
					assert.equal('/test', request.url);
					assert.equal('1.1', request.httpVersion);
					
					// WARNING: `request.rawHeaders` requires Node.js 0.12.0
					assert.deepEqual([
						'Host',
						'localhost'
					], request.rawHeaders);
					
					response.end('OK');
				}
				catch (ex) {
					done(ex);
				}
			};
			
			var response = api.HTTP(api.GET("localhost:20000/test"));
			
			assert.equal(true, response instanceof api.HTTPResponse);
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body);
				assert.equal('OK', body);
				done();
			}).done(undefined, done);
		});
		
		it('should make a `POST` request', function (done) {
			serverRequestHandler = function (request, response) {
				try {
					assert.equal('POST', request.method);
					assert.equal('/test', request.url);
					assert.equal('1.1', request.httpVersion);
					
					// WARNING: `request.rawHeaders` requires Node.js 0.12.0
					assert.deepEqual([
						'Host',
						'localhost'
					], request.rawHeaders);
					
					response.end('OK');
				}
				catch (ex) {
					done(ex);
				}
			};
			
			var response = api.HTTP(api.POST("localhost:20000/test"));
			
			assert.equal(true, response instanceof api.HTTPResponse);
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body);
				assert.equal('OK', body);
				done();
			}).done(undefined, done);
		});
		
		it('should make a `POST` request with body', function (done) {
			serverRequestHandler = function (request, response) {
				try {
					assert.equal('POST', request.method);
					assert.equal('/test', request.url);
					assert.equal('1.1', request.httpVersion);
					
					// WARNING: `request.rawHeaders` requires Node.js 0.12.0
					assert.deepEqual([
						'Host',
						'localhost',
						'Content-Type',
						'text/plain',
						'Content-Length',
						'4'
					], request.rawHeaders);
					
					var body = '';
					request.on('data', function (chunk) {
						body += chunk.toString();
					});
					request.on('end', function () {
						assert.equal("BODY", body);
					});
					
					response.end('OK');
				}
				catch (ex) {
					done(ex);
				}
			};
			
			var response = api.HTTP(api.POST("localhost:20000/test",
				"BODY", "text/plain"));
			
			assert.equal(true, response instanceof api.HTTPResponse);
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body);
				assert.equal('OK', body);
				done();
			}).done(undefined, done);
		});
		
		it('should make a `POST` request with large body (' + largeBodyLength + ' bytes)', function (done) {
			serverRequestHandler = function (request, response) {
				try {
					assert.equal('POST', request.method);
					assert.equal('/test', request.url);
					assert.equal('1.1', request.httpVersion);
					
					// WARNING: `request.rawHeaders` requires Node.js 0.12.0
					assert.deepEqual([
						'Host',
						'localhost',
						'Content-Type',
						'text/plain',
						'Content-Length',
						String(largeBodyLength - 1)
					], request.rawHeaders);
					
					var body = '';
					request.on('data', function (chunk) {
						body += chunk.toString();
					});
					request.on('end', function () {
						assert.equal(largeBody, body);
					});
					
					response.end('OK');
				}
				catch (ex) {
					done(ex);
				}
			};
			
			var response = api.HTTP(api.POST("localhost:20000/test",
				largeBody, "text/plain"));
			
			assert.equal(true, response instanceof api.HTTPResponse);
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body);
				assert.equal('OK', body);
				done();
			}).done(undefined, done);
		});
	});
});
