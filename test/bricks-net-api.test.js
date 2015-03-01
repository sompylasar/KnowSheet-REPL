var assert = require('assert');

var when = require('when');

describe('bricks-net-api', function () {
	var api = require('../lib/bricks-net-api');
	var HTTPRedirectNotAllowedException = require('../lib/bricks-net-exceptions').HTTPRedirectNotAllowedException;
	var HTTPRedirectLoopException = require('../lib/bricks-net-exceptions').HTTPRedirectLoopException;
	
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
		
		it('should set `url`', function () {
			assert.equal('url', api.GET("url").url);
		});
		
		it('should `AllowRedirects` return an instance of `GET` class', function () {
			assert.equal(true, api.GET("url").AllowRedirects() instanceof api.GET);
		});
		
		it('should `AllowRedirects` set `allow_redirects`', function () {
			assert.equal(true, api.GET("url").AllowRedirects().allow_redirects);
			assert.equal(false, api.GET("url").AllowRedirects(false).allow_redirects);
			assert.equal(true, api.GET("url").AllowRedirects(true).allow_redirects);
		});
		
		it('should `UserAgent` return an instance of `GET` class', function () {
			assert.equal(true, api.GET("url").UserAgent("USERAGENT") instanceof api.GET);
		});
		
		it('should `UserAgent` set `custom_user_agent`', function () {
			assert.equal("USERAGENT", api.GET("url").UserAgent("USERAGENT").custom_user_agent);
			assert.equal("", api.GET("url").UserAgent("").custom_user_agent);
		});
		
		it('should `UserAgent` throw if argument not set', function () {
			assert.throws(function () {
				api.GET("url").UserAgent();
			});
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
			largeBody = (new Array(largeBodyLength + 1)).join('X');
		});
		
		beforeEach(function (done) {
			serverRequestHandler = function (request, response) {
				_DEBUG_LOG('TESTS: Writing the "OK" response...');
				
				response.end('OK');
				
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
		
		it('should return a promise-like `HTTPResponse` that resolves to itself and has a `body`', function (done) {
			var response = api.HTTP(api.GET("localhost:20000/test"));
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response), 'response isPromiseLike');
			
			when(
				response
			).then(function (response) {
				assert.equal(true, response instanceof api.HTTPResponse, 'promised response instanceof HTTPResponse');
				assert.equal('string', typeof response.body);
				assert.equal('OK', response.body);
				done();
			}).done(undefined, done);
		});
		
		it('should make a `GET` request, response `body` is a promise-like that resolves to the response body', function (done) {
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
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response.body), 'response.body isPromiseLike');
			
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
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response.body), 'response.body isPromiseLike');
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body, '`body` is a string');
				assert.equal('OK', body, '`body` equals to the response body');
				done();
			}).done(undefined, done);
		});
		
		it('should make a `POST` request with a body and a content type', function (done) {
			var requestContentType = 'application/json';
			var requestBody = '{"request":"body"}';
			
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
						requestContentType,
						'Content-Length',
						requestBody.length
					], request.rawHeaders);
					
					var receivedBody = '';
					request.on('data', function (chunk) {
						receivedBody += chunk.toString();
					});
					request.on('end', function () {
						try {
							assert.equal(requestBody, receivedBody);
							
							response.end(requestBody);
						}
						catch (ex) {
							done(ex);
						}
					});
				}
				catch (ex) {
					done(ex);
				}
			};
			
			var response = api.HTTP(
				api.POST("localhost:20000/test", requestBody, requestContentType)
			);
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response.body), 'response.body isPromiseLike');
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body, '`body` is a string');
				assert.equal(requestBody, body, '`body` equals to the response body');
				done();
			}).done(undefined, done);
		});
		
		it('should make a `POST` request with a large body (' + largeBodyLength + ' bytes)', function (done) {
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
						largeBodyLength
					], request.rawHeaders);
					
					var body = '';
					request.on('data', function (chunk) {
						body += chunk.toString();
					});
					request.on('end', function () {
						try {
							// Test large request sending.
							assert.equal(largeBody, body);
							
							// Test large response parsing.
							response.end(largeBody);
						}
						catch (ex) {
							done(ex);
						}
					});
				}
				catch (ex) {
					done(ex);
				}
			};
			
			var response = api.HTTP(
				api.POST("localhost:20000/test", largeBody, "text/plain")
			);
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body, '`body` is a string');
				assert.equal(largeBody, body, '`body` equals to the response body');
				done();
			}).done(undefined, done);
		});
		
		it('should disallow redirects by default', function (done) {
			serverRequestHandler = function (request, response) {
				serverRequestHandler = function (request, response) {
					response.end('OK');
				};
				
				response.writeHead(302, { "Location": '/to' });
				response.end();
			};
			
			var response = api.HTTP(api.GET("localhost:20000/from"));
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response), 'isPromiseLike');
			
			when(
				response.body
			).then(function (body) {
				done(new Error('Resolved instead of rejected.'));
			}, function (err) {
				assert.equal(true, err instanceof HTTPRedirectNotAllowedException);
				done();
			}).done(undefined, done);
		});
		
		it('should handle redirects if allowed', function (done) {
			serverRequestHandler = function (request, response) {
				serverRequestHandler = function (request, response) {
					response.end('OK');
				};
				
				response.writeHead(302, { "Location": '/to' });
				response.end();
			};
			
			var response = api.HTTP(api.GET("localhost:20000/from").AllowRedirects());
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response), 'isPromiseLike');
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body, '`body` is a string');
				assert.equal('OK', body, '`body` equals to the response body');
				done();
			}).done(undefined, done);
		});
		
		it('should handle redirect loop', function (done) {
			var redirectHandler1 = function (request, response) {
				serverRequestHandler = redirectHandler2;
				
				response.writeHead(302, { "Location": '/redirect2' });
				response.end();
			};
			var redirectHandler2 = function (request, response) {
				serverRequestHandler = redirectHandler3;
				
				response.writeHead(302, { "Location": '/redirect3' });
				response.end();
			};
			var redirectHandler3 = function (request, response) {
				serverRequestHandler = redirectHandler1;
				
				response.writeHead(302, { "Location": '/redirect1' });
				response.end();
			};
			
			serverRequestHandler = redirectHandler1;
			
			var response = api.HTTP(api.GET("localhost:20000/redirect1").AllowRedirects());
			
			assert.equal(true, response instanceof api.HTTPResponse, 'response instanceof HTTPResponse');
			assert.equal(true, when.isPromiseLike(response), 'isPromiseLike');
			
			when(
				response.body
			).then(function (body) {
				done(new Error('Resolved instead of rejected.'));
			}, function (err) {
				assert.equal(true, err instanceof HTTPRedirectLoopException);
				done();
			}).done(undefined, done);
		});
	});
});
