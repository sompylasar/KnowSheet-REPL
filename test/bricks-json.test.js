var assert = require('assert');

var inspect = require('util').inspect;

describe('bricks-json', function () {
	var api = require('../lib/bricks-json');
	
	it('should export `JSON` function', function () {
		assert.equal('function', typeof api.JSON);
	});
	
	it('should export `ParseJSON` function', function () {
		assert.equal('function', typeof api.ParseJSON);
	});
	
	it('should export `Serializable` function', function () {
		assert.equal('function', typeof api.Serializable);
	});
	
	describe('`JSON`', function () {
		it('should serialize a serializable into JSON', function () {
			function TestObject() {
				function InnerObject() {
					api.Serializable.call(this);
					
					this.key = "value";
				}
				
				api.Serializable.call(this);
				
				this.object = new InnerObject();
				this.array = [ 1, 2, 3 ];
			}
			
			var object = new TestObject();
			var expected = '{"value0":{"object":{"key":"value"},"array":[1,2,3]}}';
			var actual = api.JSON(object);
			
			assert.strictEqual(expected, actual);
		});
		
		it('should throw for non-serializable', function () {
			var object = { object: { key: "value" }, array: [ 1, 2, 3] };
			
			assert.throws(function () {
				api.JSON(object);
			});
		});
		
		it('should serialize under the passed root name', function () {
			function TestObject() {
				api.Serializable.call(this);
			}
			
			var object = new TestObject();
			var expected = '{"test_name":{}}';
			var actual = api.JSON(object, "test_name");
			
			assert.strictEqual(expected, actual);
		});
		
		it('should ignore non-serializable properties', function () {
			function TestObject() {
				api.Serializable.call(this);
				
				this.non_serializable_object = {
					"key": "value"
				};
				
				this.non_serializable_function = function () {};
			}
			
			var object = new TestObject();
			var expected = '{"value0":{}}';
			var actual = api.JSON(object);
			
			assert.strictEqual(expected, actual);
		});
	});
	
	describe('`ParseJSON`', function () {
		it('should parse JSON into a serializable', function () {
			var json = '{"object":{"key":"value"},"array":[1,2,3]}';
			var expected = { object: { key: "value" }, array: [ 1, 2, 3 ] };
			var actual = api.ParseJSON(json);
			assert.deepEqual(expected, actual);
			assert.equal('function', typeof actual.serialize);
		});
	});
});
