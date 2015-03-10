var assert = require('assert');

var inspect = require('util').inspect;

var when = require('when');

describe('bricks-net-api', function () {
	var api = require('../lib/bricks-net-api');
	
	var HTTPRedirectNotAllowedException = require('../lib/bricks-net-exceptions').HTTPRedirectNotAllowedException;
	var HTTPRedirectLoopException = require('../lib/bricks-net-exceptions').HTTPRedirectLoopException;
	var ConnectionResetByPeer = require('../lib/bricks-net-exceptions').ConnectionResetByPeer;
	
	
	it('should export `DefaultContentType` function', function () {
		assert.equal('function', typeof api.DefaultContentType);
		assert.equal('// KnowSheet Bricks DefaultContentType', inspect(api.DefaultContentType).toString());
	});
	
	it('should export `HTTPHeaders` function', function () {
		assert.equal('function', typeof api.HTTPHeaders);
		assert.equal('// KnowSheet Bricks HTTPHeaders', inspect(api.HTTPHeaders).toString());
	});
	
	it('should export `HTTPResponse` function', function () {
		assert.equal('function', typeof api.HTTPResponse);
		assert.equal('// KnowSheet Bricks HTTPResponse', inspect(api.HTTPResponse).toString());
	});
	
	it('should export `GET` function', function () {
		assert.equal('function', typeof api.GET);
		assert.equal('// KnowSheet Bricks GET', inspect(api.GET).toString());
	});
	
	it('should export `POST` function', function () {
		assert.equal('function', typeof api.POST);
		assert.equal('// KnowSheet Bricks POST', inspect(api.POST).toString());
	});
	
	it('should export `POSTFromFile` function', function () {
		assert.equal('function', typeof api.POSTFromFile);
		assert.equal('// KnowSheet Bricks POSTFromFile', inspect(api.POSTFromFile).toString());
	});
	
	it('should export `HTTP` function', function () {
		assert.equal('function', typeof api.HTTP);
		assert.equal('// KnowSheet Bricks HTTP', inspect(api.HTTP).toString());
	});
	
	it('should export `JSON` function', function () {
		assert.equal('function', typeof api.JSON);
		assert.equal('// KnowSheet Bricks JSON', inspect(api.JSON).toString());
	});
	
	it('should export `ParseJSON` function', function () {
		assert.equal('function', typeof api.ParseJSON);
		assert.equal('// KnowSheet Bricks ParseJSON', inspect(api.ParseJSON).toString());
	});
	
	describe('`DefaultContentType`', function () {
		it('should return "text/plain"', function () {
			assert.strictEqual("text/plain", api.DefaultContentType());
		});
	});
	
	describe('`HTTPHeaders`', function () {
		it('should create an instance of `HTTPHeaders` class', function () {
			assert.equal(true, api.HTTPHeaders() instanceof api.HTTPHeaders);
		});
		
		it('should have `headers` property which is an `Array`', function () {
			assert.equal(true, Array.isArray(api.HTTPHeaders().headers));
		});
		
		it('should have `Set` method', function () {
			assert.equal('function', typeof api.HTTPHeaders().Set);
		});
		
		describe('`Set` method', function () {
			it('should add headers and allow chaining', function () {
				var headers = api.HTTPHeaders();
				
				var ret = headers.Set('Custom', 'Header');
				
				assert.strictEqual(headers, ret);
				
				assert.deepEqual([
					{
						first: 'Custom',
						second: 'Header'
					}
				], ret.headers);
				
				headers.Set('Custom2', 'Header2');
				
				assert.deepEqual([
					{
						first: 'Custom',
						second: 'Header'
					},
					{
						first: 'Custom2',
						second: 'Header2'
					}
				], ret.headers);
			});
		});
	});
	
	describe('`JSON`', function () {
		it('should serialize into JSON asynchronously', function (done) {
			var object = { object: { key: "value" }, array: [ 1, 2, 3] };
			when(
				api.JSON(object)
			).then(function (result) {
				assert.strictEqual('{"object":{"key":"value"},"array":[1,2,3]}', result);
				done();
			}).done(undefined, done);
		});
	});
	
	describe('`ParseJSON`', function () {
		it('should parse JSON asynchronously', function (done) {
			var object = { object: { key: "value" }, array: [ 1, 2, 3] };
			var json = '{"object":{"key":"value"},"array":[1,2,3]}';
			when(
				api.ParseJSON(json)
			).then(function (result) {
				assert.deepEqual(object, result);
				done();
			}).done(undefined, done);
		});
	});
	
	describe('`GET`', function () {
		it('should create an instance of `GET` class', function () {
			assert.equal(true, api.GET("url") instanceof api.GET);
		});
		
		it('should set `url`', function () {
			assert.strictEqual('url', api.GET("url").url);
		});
		
		it('should set `extra_headers`', function () {
			assert.deepEqual([
				{
					first: 'Custom',
					second: 'Header'
				}
			], api.GET("url", api.HTTPHeaders().Set('Custom', 'Header')).extra_headers);
		});
		
		it('should throw on invalid arguments', function () {
			assert.throws(function () {
				api.GET();
			});
			assert.throws(function () {
				api.GET(1);
			});
			assert.throws(function () {
				api.GET("url", "invalid argument");
			});
			assert.throws(function () {
				api.GET("url", api.HTTPHeaders(), "invalid argument");
			});
		});
		
		describe('`AllowRedirects` method', function () {
			it('should allow chaining', function () {
				var ret = api.GET("url");
				assert.strictEqual(ret, ret.AllowRedirects());
			});
			
			it('should set `allow_redirects`', function () {
				assert.strictEqual(true, api.GET("url").AllowRedirects().allow_redirects);
				assert.strictEqual(false, api.GET("url").AllowRedirects(false).allow_redirects);
				assert.strictEqual(true, api.GET("url").AllowRedirects(true).allow_redirects);
			});
		});
		
		describe('`UserAgent` method', function () {
			it('should allow chaining', function () {
				var ret = api.GET("url");
				assert.strictEqual(ret, ret.UserAgent("USERAGENT"));
			});
		
			it('should set `custom_user_agent`', function () {
				assert.strictEqual("USERAGENT", api.GET("url").UserAgent("USERAGENT").custom_user_agent);
				assert.strictEqual("", api.GET("url").UserAgent("").custom_user_agent);
			});
		
			it('should throw if argument not set', function () {
				assert.throws(function () {
					api.GET("url").UserAgent();
				});
			});
		});
	});
	
	describe('`POST`', function () {
		it('should create an instance of `POST` class', function () {
			assert.equal(true, api.POST("url") instanceof api.POST);
		});
		
		it('should set `url`', function () {
			assert.strictEqual('url', api.POST("url").url);
		});
		
		it('should set `body` and `has_body` (string)', function () {
			assert.strictEqual('body', api.POST("url", "body").body);
			
			assert.strictEqual(false, api.POST("url").has_body);
			assert.strictEqual(true, api.POST("url", "body").has_body);
			assert.strictEqual(true, api.POST("url", "").has_body);
		});
		
		it('should set `body` and `has_body` (JSON)', function () {
			var object = { test: [ 1, 2, 3 ] };
			var body = '{"data":{"test":[1,2,3]}}';
			assert.strictEqual(body, api.POST("url", object).body);
			assert.strictEqual(true, api.POST("url", object).has_body);
		});
		
		it('should set default `content_type`', function () {
			assert.strictEqual(api.DefaultContentType(), api.POST("url").content_type);
			assert.strictEqual(api.DefaultContentType(), api.POST("url", "body").content_type);
			assert.strictEqual("application/json", api.POST("url", {}).content_type);
		});
		
		it('should set custom `content_type`', function () {
			assert.strictEqual("content/type", api.POST("url", "body", "content/type").content_type);
			assert.strictEqual("content/type", api.POST("url", {}, "content/type").content_type);
		});
		
		it('should set `extra_headers`', function () {
			assert.deepEqual([
				{
					first: 'Custom',
					second: 'Header'
				}
			], api.POST("url", "body", "content/type", api.HTTPHeaders().Set('Custom', 'Header')).extra_headers);
		});
		
		it('should throw on invalid arguments', function () {
			assert.throws(function () {
				api.POST();
			});
			assert.throws(function () {
				api.POST(1, 3, 5);
			});
			assert.throws(function () {
				api.POST("url", "body", "content/type", "invalid argument");
			});
			assert.throws(function () {
				api.POST("url", "body", "content/type", HTTPHeaders(), "invalid argument");
			});
		});
	});
	
	describe('`POSTFromFile`', function () {
		it('should create an instance of `POSTFromFile` class', function () {
			assert.equal(true, api.POSTFromFile("url", __filename, "application/javascript") instanceof api.POSTFromFile);
		});
	});
	
	describe('`HTTP` (client)', function () {
		var KBYTES_IN_BYTES = 1000;
		var MBYTES_IN_BYTES = 1000 * KBYTES_IN_BYTES;
		var largeBodyLength = 50 * MBYTES_IN_BYTES;
		var largeBody;
		
		var http = require('http');
		var server;
		var sockets = [];
		
		var serverRequestHandler;
		
		var _DEBUG_LOG = function () {};
		//var _DEBUG_LOG = function () { console.log.apply(console, arguments); };
		
		before(function () {
			largeBody = (new Array(largeBodyLength + 1)).join('X');
		});
		
		beforeEach(function (done) {
			serverRequestHandler = function (request, response) {
				_DEBUG_LOG('TEST `HTTP` (client): Writing the "OK" response...');
				
				response.end('OK');
				
				_DEBUG_LOG('`HTTP` (client): Response ended.');
			};
			server = http.createServer();
			server.on('connection', function (socket) {
				var socketString = socket.remoteAddress + ':' + socket.remotePort;
				_DEBUG_LOG('TEST `HTTP` (client): Server got a connection:', socketString);
				
				sockets.push(socket);
				socket.on('close', function () {
					_DEBUG_LOG('TEST `HTTP` (client): Connection closed:', socketString);
					
					var index = sockets.indexOf(socket);
					if (index >= 0) {
						sockets.splice(index, 1);
					}
				});
			});
			server.on('request', function (request, response) {
				_DEBUG_LOG('TEST `HTTP` (client): Got request:', request.method, request.url, request.httpVersion, '\n', request.headers);
				serverRequestHandler(request, response);
			});
			server.on('listening', function () {
				_DEBUG_LOG('TEST `HTTP` (client): Server is listening.');
				done();
			});
			server.listen(20000);
		});
		afterEach(function (done) {
			_DEBUG_LOG('TEST `HTTP` (client): Server is shutting down...');
			server.close(function () {
				_DEBUG_LOG('TEST `HTTP` (client): Server has been shut down.');
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
		
		it('should handle response `Content-Length`', function (done) {
			serverRequestHandler = function (request, response) {
				response.writeHead(200, {
					'Content-Length': 5
				});
				response.write('OK');
				response.write('OK2');
				response.end('Overflow');
			};
			
			var response = api.HTTP(api.GET("localhost:20000/test"));
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body);
				assert.equal('OKOK2', body);
				done();
			}).done(undefined, done);
		});
		
		// TODO(sompylasar): Investigate the unhandled rejection in the following test.
		it('should throw `ConnectionResetByPeer` on early close @disabled', function (done) {
			serverRequestHandler = function (request, response) {
				response.writeHead(200, {
					'Content-Length': 1000
				});
				response.end('Partial');
				
				_DEBUG_LOG('`HTTP` (client): Partial response sent.');
			};
			
			var response = api.HTTP(api.GET("localhost:20000/test"));
			
			when(
				response.body
			).then(function (body) {
				done(new Error('Resolved instead of rejected.'));
			}, function (err) {
				assert.equal(true, err instanceof ConnectionResetByPeer);
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
							// Test sending string request.
							assert.equal(requestBody, receivedBody);
							
							// Test reading non-chunked response.
							response.writeHead(200, {
								'Content-Type': requestContentType,
								'Content-Length': requestBody.length
							});
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
		
		it('should make a `POST` request with a large body (' + largeBodyLength + ' bytes) non-chunked', function (done) {
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
							// Test sending large string request.
							assert.equal(largeBody, body);
							
							// Test receiving large non-chunked response.
							response.writeHead(200, {
								'Content-Type': 'application/json',
								'Content-Length': largeBodyLength
							});
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
		
		it('should make a `POST` request with a large body (' + largeBodyLength + ' bytes) chunked', function (done) {
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
							// Test sending large string request.
							assert.equal(largeBody, body);
							
							// Test receiving large chunked response.
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
		
		it('should make a `POST` request with a JSON object', function (done) {
			var requestObject = {
				"object": {},
				"array": [],
				"number": 123.456
			};
			var requestJson = '{"data":{"object":{},"array":[],"number":123.456}}';
			
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
						'application/json',
						'Content-Length',
						requestJson.length
					], request.rawHeaders);
					
					var body = '';
					request.on('data', function (chunk) {
						body += chunk.toString();
					});
					request.on('end', function () {
						try {
							// Test sending JSON request.
							assert.equal(requestJson, body);
							
							// Test receiving JSON response.
							response.writeHead(200, {
								'Content-Type': 'application/json',
								'Content-Length': requestJson.length
							});
							response.end(requestJson);
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
				api.POST("localhost:20000/test", requestObject)
			);
			
			when(
				response.body
			).then(function (body) {
				assert.equal('string', typeof body, '`body` is a string');
				assert.equal(requestJson, body, '`body` equals to the response body');
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
		
		it('should save response to file if required', function (done) {
			var responseFileName = (new Date()).getTime() + '_response.txt';
			var responseFilePath = __dirname + '/' + responseFileName;
			
			after(function () {
				try {
					require('fs').unlinkSync(responseFilePath);
				}
				catch (ex) {
					if (ex.code !== 'ENOENT') {
						throw ex;
					}
				}
			});
			
			serverRequestHandler = function (request, response) {
				response.end('OK');
			};
			
			var response = api.HTTP(api.GET("localhost:20000/test"), api.SaveResponseToFile(responseFilePath));
			
			when(
				response
			).then(function (response) {
				assert.equal('undefined', typeof response.body, '`body` is undefined');
				assert.equal('string', typeof response.body_file_name, '`body_file_name` is a string');
				assert.equal(responseFilePath, response.body_file_name, '`body_file_name` equals to the requested file path');
				assert.equal('OK', require('fs').readFileSync(responseFilePath), '`body_file_name` contents equals response body');
				done();
			}).done(undefined, done);
		});
	});
	
	describe('`HTTP` (server)', function () {
		var serverPort = 20000;
		
		var _DEBUG_LOG = function () {};
		//var _DEBUG_LOG = function () { console.log.apply(console, arguments); };
		
		beforeEach(function () {
			++serverPort;
		});
		
		it('should create an HTTP server', function (done) {
			var server = api.HTTP(serverPort);
			
			when(
				server
			).then(function (server) {
				assert.equal('function', typeof server.Register);
				assert.equal('function', typeof server.UnRegister);
				assert.equal('function', typeof server.ResetAllHandlers);
				assert.equal('function', typeof server.HandlersCount);
				assert.strictEqual(0, server.HandlersCount());
				assert.equal('// KnowSheet Bricks HTTPServer at port ' + serverPort, inspect(server).toString());
				done();
			}).done(undefined, done);
		});
		
		it('should return the same server for the same port', function () {
			var server = api.HTTP(serverPort);
			var server2 = api.HTTP(serverPort);
			
			assert.strictEqual(server, server2);
		});
		
		it('should return different servers for different ports', function () {
			var server = api.HTTP(serverPort);
			
			++serverPort;
			var server2 = api.HTTP(serverPort);
			
			assert.notStrictEqual(server, server2);
		});
		
		it('should `Register` and `UnRegister` a handler, throw errors for duplicates', function (done) {
			var server = api.HTTP(serverPort);
			var handler = function (r) {};
			
			when(
				server
			).then(function (server) {
				assert.strictEqual(0, server.HandlersCount());
				assert.throws(function () {
					server.UnRegister('/test');
				});
				
				server.Register('/test', handler);
				assert.strictEqual(1, server.HandlersCount());
				
				assert.throws(function () {
					server.Register('/test', handler);
				});
				
				server.UnRegister('/test');
				assert.strictEqual(0, server.HandlersCount());
				
				// TODO(sompylasar): Verify the handler function was removed.
				
				assert.throws(function () {
					server.UnRegister('/test');
				});
				
				done();
			}).done(undefined, done);
		});
		
		it('should `ResetAllHandlers` unregister all handlers', function (done) {
			var server = api.HTTP(serverPort);
			var handler = function (r) {};
			
			when(
				server
			).then(function (server) {
				assert.strictEqual(0, server.HandlersCount());
				server.Register('/test1', handler);
				server.Register('/test2', handler);
				server.Register('/test3', handler);
				assert.strictEqual(3, server.HandlersCount());
				
				server.ResetAllHandlers();
				assert.strictEqual(0, server.HandlersCount());
				
				// TODO(sompylasar): Verify the handler functions were removed.
				
				done();
			}).done(undefined, done);
		});
		
		it('should handle port bind error', function (done) {
			var portOccupier = require('http').createServer();
			portOccupier.on('listening', function () {
				var server = api.HTTP(serverPort);
				
				when(
					server
				).then(function (server) {
					done(new Error('Resolved instead of rejected.'));
				}, function (err) {
					assert.equal(true, require('util').isError(err));
					done();
				}).done(undefined, done);
			});
			portOccupier.listen(serverPort);
		});
		
		it('should accept an HTTP request', function (done) {
			var server = api.HTTP(serverPort);
			var handlerCalled = 0;
			
			when(
				server
			).then(function (server) {
				_DEBUG_LOG('TEST `HTTP` (server): Server done:', server);
				
				server.Register('/test', function (r) {
					// Have to try..catch here to propagate exceptions to the test suite
					// because the server does not report them.
					try {
						++handlerCalled;
						
						_DEBUG_LOG('TEST `HTTP` (server): Server handler called:', r);
						
						assert.equal('function', typeof r);
						assert.equal('function', typeof r.SendChunkedResponse);
						assert.equal('object', typeof r.connection);
						assert.equal('function', typeof r.connection.SendHTTPResponse);
						assert.equal('function', typeof r.connection.SendChunkedHTTPResponse);
						
						r('OK');
						
						_DEBUG_LOG('TEST `HTTP` (server): Server handler responded.');
					}
					catch (ex) {
						done(ex);
					}
				});
				
				return when(
					api.HTTP(api.GET("http://localhost:" + serverPort + "/test")).body
				).then(function (body) {
					assert.strictEqual(1, handlerCalled);
					assert.strictEqual('OK', body);
					done();
				});
			}).done(undefined, done);
		});
		
		it('should be able to send chunked response', function (done) {
			var server = api.HTTP(serverPort);
			var handlerCalled = 0;
			
			when(
				server
			).then(function (server) {
				server.Register('/test_chunked', function (r) {
					// Have to try..catch here to propagate exceptions to the test suite
					// because the server does not report them.
					try {
						++handlerCalled;
						
						_DEBUG_LOG('TEST `HTTP` (server): Server handler called:', r);
						
						var sender = r.SendChunkedResponse();
						
						assert.equal('object', typeof sender);
						assert.equal('function', typeof sender.Send);
						
						sender.Send('OK1');
						sender.Send('OK2');
						sender.Send('OK3');
						
						_DEBUG_LOG('TEST `HTTP` (server): Server handler responded.');
					}
					catch (ex) {
						done(ex);
					}
				});
				
				return when(
					api.HTTP(api.GET("http://localhost:" + serverPort + "/test_chunked")).body
				).then(function (body) {
					assert.strictEqual(1, handlerCalled);
					assert.strictEqual('OK1OK2OK3', body);
					done();
				});
			}).done(undefined, done);
		});
		
		it('should respond with HTTP 404 if no handler is found for the path', function (done) {
			var server = api.HTTP(serverPort);
			
			when(
				server
			).then(function (server) {
				return when(
					api.HTTP(api.GET("http://localhost:" + serverPort + "/test"))
				).then(function (response) {
					assert.strictEqual(404, response.code);
					assert.strictEqual('<h1>NOT FOUND</h1>\n', response.body);
					done();
				});
			}).done(undefined, done);
		});
		
		it('should respond with HTTP 500 if no response is sent from the handler', function (done) {
			var server = api.HTTP(serverPort);
			var handlerCalled = 0;
			
			when(
				server
			).then(function (server) {
				server.Register('/test', function (r) {
					++handlerCalled;
				});
				
				return when(
					api.HTTP(api.GET("http://localhost:" + serverPort + "/test"))
				).then(function (response) {
					assert.strictEqual(1, handlerCalled);
					assert.strictEqual(500, response.code);
					assert.strictEqual('<h1>INTERNAL SERVER ERROR</h1>\n', response.body);
					done();
				});
			}).done(undefined, done);
		});
	});
});
