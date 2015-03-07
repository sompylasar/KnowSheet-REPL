# KnowSheet-REPL
A Read-Eval-Print-Loop (REPL) shell to demonstrate the KnowSheet Bricks C++ syntax.

## Installation

[Node.js](http://nodejs.org/) v0.12.0 is required to install and run the REPL.

```bash
git clone https://github.com/KnowSheet/KnowSheet-REPL.git
cd KnowSheet-REPL
npm install
```

## Usage

Start the REPL from the terminal:
```bash
npm start
```
The command prompt `KnowSheet> ` will appear.

... or evaluate one expression from the command-line:
```bash
echo 'HTTP(GET("http://httpbin.org/get?query=1")).body' | npm start
```

... or evaluate and pass the result to another command:
```bash
echo 'HTTP(GET("http://httpbin.org/get?query=1")).body' | npm start | cat
```

### Expressions

Perform an HTTP GET request and print the response:
```
KnowSheet> HTTP(GET("http://httpbin.org/get?query=1")).body
```

Perform an HTTP POST request and print the response:
```
KnowSheet> HTTP(POST("http://httpbin.org/post", "BODY", "text/plain")).body
```

Parse a JSON response into an object, get a field from it:
```
KnowSheet> JSONParse(HTTP(GET("http://httpbin.org/get?query=1")).body).args
```

POST a JSON-encoded object:
```
KnowSheet> JSONParse(HTTP(POST("http://httpbin.org/post", DemoObject())).body).json
```
<sup>(in C++, you'll have a cerealizable object in place of the `DemoObject()`)</sup>

Allow redirects:
```
KnowSheet> HTTP(GET("http://httpbin.org/redirect/5").AllowRedirects()).body
```

Provide a custom User-Agent:
```
KnowSheet> HTTP(GET("http://httpbin.org/get").UserAgent("KnowSheet-REPL/1.0.0")).body
```

Provide extra HTTP headers:
```
KnowSheet> HTTP(GET("http://httpbin.org/get?query=1", HTTPHeaders().Set("Custom", "Header"))).body
KnowSheet> HTTP(POST("http://httpbin.org/post", "BODY", "text/plain", HTTPHeaders().Set("Custom", "Header"))).body
```

Chain requests:
```
KnowSheet> JSONParse(HTTP(POST("http://httpbin.org/post", JSONParse(HTTP(GET("http://httpbin.org/get?query=1")).body))).body)
```
