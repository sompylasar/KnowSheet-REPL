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

#### Start the interactive shell
```bash
node run
```
The command prompt `KnowSheet> ` will appear.

#### Evaluate from the command-line
```bash
echo 'HTTP(GET("http://httpbin.org/get?query=1")).body' | node run
```

#### Evaluate and pass the result to another command
```bash
echo 'HTTP(GET("http://httpbin.org/get?query=1")).body' | node run | cat
```
<sup>If `stdout` is not a `tty`, emits the result as text into `stdout`, the errors into `stderr`.</sup>

#### Override the default prompt
```bash
node run --prompt 'Bricks> '
```
The command prompt `Bricks> ` will appear.

### HTTP client

* Bricks provides utilities to perform HTTP requests.
* By default, the redirects are forbidden and result in an error. They can be enabled per request.

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

* Bricks maintains a single server per port.
* Each server accepts connections since start till the process exits.
* There can only be a single handler for a given path.
* The calls to the server methods can be chained.
* The handler lambda syntax in the REPL mimics C++11 to a certain extent -- no full lambda support guaranteed.

#### Start an HTTP server
```
KnowSheet> HTTP(2015)
// KnowSheet Bricks HTTPServer at port 2015
```

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

#### POST a JSON-encoded instance of a serializable type
```
KnowSheet> HTTP(POST("http://httpbin.org/post", DemoObject())).body
```
<sup>The syntax mimics C++ Bricks exactly, as long as `DemoObject` is defined as a serializable type.</sup>

#### Parse a JSON response into an object
```
KnowSheet> ParseJSON(HTTP(GET("http://httpbin.org/get?query=1")).body).args
```
<sup>The syntax deviates from C++ Bricks which requires a defined type for the output instance: either `T output = ParseJSON<T>(string);` or `T output; ParseJSON(string, output);`.</sup>

### Advanced examples

#### Chain requests
```
KnowSheet> ParseJSON(HTTP(POST("http://httpbin.org/post", ParseJSON(HTTP(GET("http://httpbin.org/get?query=1")).body))).body)
```
