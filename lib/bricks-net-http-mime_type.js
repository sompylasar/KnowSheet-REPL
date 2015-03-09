'use strict';

var GetFileExtension = require('./bricks-filesystem').GetFileExtension;


var file_extension_to_mime_type_map = {
    "js": "application/javascript",
    "json": "application/json",
    "css": "text/css",
    "html": "text/html",
    "htm": "text/html",
    "txt": "text/plain",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "svg": "image/svg+xml"
};


exports.GetFileMimeType = function () {
	return cppArguments.assert('GetFileMimeType', [
		[
			cppArguments.assertion('string', 'const std::string&', 'pfile_nameath'),
			cppArguments.assertion('string', 'const std::string&', 'default_type', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (file_name, default_type) {
				if (typeof default_type === 'undefined') {
					default_type = "text/plain";
				}
				
				var extension = GetFileExtension(file_name);
				extension = extension.toLowerCase();
				
				return (file_extension_to_mime_type_map[extension] || default_type);
			}
		]
	], arguments);
};
