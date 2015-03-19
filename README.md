# KnowSheet-REPL
A Read-Eval-Print-Loop (REPL) shell to demonstrate the [KnowSheet Bricks](https://github.com/KnowSheet/Bricks) C++ syntax.

## Installation

[Node.js](http://nodejs.org/) v0.12.0 is required to install and run the REPL.

```bash
git clone https://github.com/KnowSheet/KnowSheet-REPL.git
cd KnowSheet-REPL
npm install
```

## Usage

#### Start the interactive REPL
```bash
node run
```
The command prompt `KnowSheet> ` will appear.

#### Evaluate from the command-line
```bash
echo 'HTTP(GET("http://httpbin.org/get?query=1")).body' | node run
```
If `stdin` is not a `tty`, the REPL starts in a non-interactive mode.

#### Evaluate and pass the result to another command
```bash
echo 'HTTP(GET("http://httpbin.org/get?query=1")).body' | node run | cat
```
If `stdout` is not a `tty`, the result is emitted as text into `stdout`, the errors are emitted as text into `stderr`.

#### Override the default prompt
```bash
node run --prompt 'Bricks> '
```
The command prompt `Bricks> ` will appear.

### HTTP client

Bricks provides utilities to perform HTTP requests. By default, redirects are forbidden and result in an error; they can be enabled per request.

#### Perform an HTTP GET request
```
KnowSheet> HTTP(GET("http://httpbin.org/get?query=1")).body
```

#### Perform an HTTP POST request
```
KnowSheet> HTTP(POST("http://httpbin.org/post", "BODY", "text/plain")).body
```

#### Allow redirects
```
KnowSheet> HTTP(GET("http://httpbin.org/redirect/5").AllowRedirects()).body
```

#### Provide a custom `User-Agent`
```
KnowSheet> HTTP(GET("http://httpbin.org/get").UserAgent("KnowSheet-REPL/1.0.0")).body
```

#### Provide extra HTTP headers
For `GET` requests:
```
KnowSheet> HTTP(GET("http://httpbin.org/get?query=1", HTTPHeaders().Set("Custom", "Header"))).body
```

For `POST` requests:
```
KnowSheet> HTTP(POST("http://httpbin.org/post", "BODY", "text/plain", HTTPHeaders().Set("Custom", "Header"))).body
```

### HTTP server

Bricks provides utilities to create simple HTTP-based servers.

#### Start an HTTP server
```
KnowSheet> HTTP(2015)
// KnowSheet Bricks HTTPServer at port 2015
```

* Bricks maintains a single server per port. No need to explicitly start a server: the first call to `HTTP` with a port number starts a server on that port and returns an instance of the server; the next calls with the same port reference the started server.
* The calls to the server methods can be chained (each method returns the server instance).
* Each server accepts connections since its start till the process exits. No need to explicitly stop it.

#### Register an endpoint on an HTTP server
```
KnowSheet> HTTP(2015).Register("/ping", [](Request r) { r("pong"); })
// KnowSheet Bricks HTTPServer at port 2015
KnowSheet> HTTP(GET("http://localhost:2015/ping")).body
--------------------------------------------------------------------------------
pong
--------------------------------------------------------------------------------
(32ms)
```

* There can only be a single handler for an endpoint path. The handler is expected to dispatch by HTTP method (verb).
* The handler lambda syntax in the REPL mimics C++11 to a certain extent -- no full lambda support is guaranteed.

#### Unregister an endpoint from an HTTP server
```
KnowSheet> HTTP(2015).UnRegister("/ping")
```

#### Use the request data in an HTTP server handler
```
KnowSheet> HTTP(2015).Register("/test", [](Request r){ r(r.timestamp + " " + r.method + " " + r.url.ComposeURL() + "\n" + r.body); })
// KnowSheet Bricks HTTPServer at port 2015
KnowSheet> HTTP(POST("localhost:2015/test", "BODY")).body
--------------------------------------------------------------------------------
1426024237701 POST /test
BODY
--------------------------------------------------------------------------------
(12ms)
```

### JSON

Bricks provides utilities to parse [JSON](http://json.org/) strings into instances of serializable types and serialize them back into JSON. The REPL mimics Bricks C++ syntax to a certain extent.

#### POST a JSON-encoded instance of a serializable type
```
KnowSheet> HTTP(POST("http://httpbin.org/post", DemoObject())).body
```

The syntax mimics C++ Bricks exactly, as long as `DemoObject` is defined as a serializable type.

#### Parse a JSON response into an object
```
KnowSheet> ParseJSON(HTTP(GET("http://httpbin.org/get?query=1")).body).args
```

The syntax deviates from C++ Bricks which requires a serializable type specified for the response object, for example, `auto response = ParseJSON<HttpbinGetResponse>(response_text);` or `HttpbinGetResponse response; ParseJSON(response_text, response);`.

### Advanced examples

#### Chain requests
```
KnowSheet> ParseJSON(HTTP(POST("http://httpbin.org/post", ParseJSON(HTTP(GET("http://httpbin.org/get?query=1")).body))).body)
```

In C++ Bricks, the calls to `ParseJSON` would be templated by serializable types of the response objects, for example, `ParseJSON<HttpbinPostResponse>( /* ... */ )`.
