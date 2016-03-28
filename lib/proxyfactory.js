'use strict';

// Dependencies
var iconv = require('iconv-lite');
var request = require('request');
var querystring = require('querystring');
var InterfacefManager = require('./interfacemanager');

// Instance of InterfaceManager, will be intialized when the proxy.use() is called.
var interfaceManager;

var STATUS_MOCK = 'mock';
var STATUS_MOCK_ERR = 'mockerr';
var ENCODING_RAW = 'raw';

// Proxy constructor
function Proxy(options) {
	this._opt = options || {};
	this._urls = this._opt.urls || {};
	if (this._opt.status === STATUS_MOCK || this._opt.status === STATUS_MOCK_ERR) {
		return;
	}
	var currUrl = this._urls[this._opt.status];

	if (!currUrl) {
		throw new Error('No url can be proxied!');
	}

	this._opt.url = currUrl;
	this._opt.method = (this._opt.method || 'GET').toUpperCase();
}

/**
 * use
 * @param {InterfaceManager} ifmgr
 * @throws errors
 */
Proxy.use = function(ifmgr) {

	if (ifmgr instanceof InterfacefManager) {
		interfaceManager = ifmgr;
	} else {
		throw new Error('Proxy can only use instance of InterfacefManager!');
	}

	this._engineName = interfaceManager.getEngine();

	return this;
};

Proxy.getMockEngine = function() {
	if (this._mockEngine) {
		return this._mockEngine;
	}
	return this._mockEngine = require(this._engineName);
};

Proxy.getInterfaceIdsByPrefix = function(pattern) {
	return interfaceManager.getInterfaceIdsByPrefix(pattern);
};

// @throws errors
Proxy.getRule = function(interfaceId) {
	return interfaceManager.getRule(interfaceId);
};

// {Object} An object map to store created proxies. The key is interface id
// and the value is the proxy instance. 
Proxy.objects = {};

// Proxy factory
// @throws errors
Proxy.create = function(interfaceId) {
	if (!!this.objects[interfaceId]) {
		return this.objects[interfaceId];
	}
	var opt = interfaceManager.getProfile(interfaceId);
	if (!opt) {
		throw new Error('Invalid interface id: ' + interfaceId);
	}
	return this.objects[interfaceId] = new this(opt);
};

Proxy.prototype = {
	request: function(params, callback, errCallback, cookie) {
		var self = this;
		var opt = self._opt;
		
		if (opt.isCookieNeeded === true && cookie === undefined) {
			throw new Error('This request is cookie needed, you must set a cookie for it before request. id = ' + this._opt.id);
		}

		errCallback = typeof errCallback !== 'function'
			? function(e) { console.error(e); }
			: errCallback;

		if (this._opt.status === STATUS_MOCK
			|| this._opt.status === STATUS_MOCK_ERR) {
			this._mockRequest(params, callback, errCallback);
			return;
		}
		
		var options = {
			url: opt.url,
			method: opt.method,
			timeout: opt.timeout,
			encoding: null,
			pool: { maxSockets: Infinity },//http socket连接池设置为无穷大
			headers: {}
		};

		if (options.method === 'POST') {
			options.form = params;
		} else {
			options.qs = params;
		}

		if (!!cookie) {
			options.headers.Cookie = cookie;
		}

		request(options, (error, response, body) => {
			if (error) {
				return errCallback(new Error('Request service error,url:' + options.url + ';params:' + querystring.stringify(params) + ';isConnect:' + error.connect + '; error:' + error.stack));
			}

			if (opt.encoding === ENCODING_RAW) {
				return callback(body);
			}

			body = iconv.fromEncoding(body, opt.encoding);

			if (opt.dataType.toLowerCase() == 'json') {
				try {
					body = JSON.parse(body);
				} catch (error) {
					return errCallback(new Error('request return value parse json fail,url:' + options.url + ';params:' + querystring.stringify(params) + ';returnValue:' + body + '; error:'+ error.stack));
				}
			}

			callback(body, response.headers['set-cookie']);
		});
	},
	getOption: function(name) {
		return this._opt[name];
	},
	_mockRequest: function(params, callback, errCallback) {
		try {
			var engine = Proxy.getMockEngine();
			if (!this._rule) {
				this._rule = Proxy.getRule(this._opt.id);
			}
			if (this._opt.isRuleStatic) {
				callback(this._opt.status === STATUS_MOCK
					? this._rule.response
					: this._rule.responseError);
				return;
			}

			// special code for river-mock
			if (Proxy._engineName === 'river-mock') {
				callback(engine.spec2mock(this._rule));
				return;
			}
			// special code for mockjs
			callback(this._opt.status === STATUS_MOCK
				? engine.mock(this._rule.response)
				: engine.mock(this._rule.responseError)
			);
		} catch (e) {
			errCallback(e);
		}
	}
};

module.exports = Proxy;

