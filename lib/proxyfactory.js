'use strict';

// Dependencies
const iconv = require('iconv-lite');
const request = require('request');
const querystring = require('querystring');
const InterfacefManager = require('./interfacemanager');

// Instance of InterfaceManager, will be intialized when the proxy.use() is called.
let interfaceManager;
let objects = {};

const STATUS_MOCK = 'mock';
const STATUS_MOCK_ERR = 'mockerr';
const ENCODING_RAW = 'raw';

// Proxy constructor
class Proxy {
	constructor(options) {
		this._opt = options || {};
		this._urls = this._opt.urls || {};
		if (this._opt.status === STATUS_MOCK || this._opt.status === STATUS_MOCK_ERR) {
			return;
		}
		let currUrl = this._urls[this._opt.status];

		if (!currUrl) {
			throw new Error('No url can be proxied!');
		}

		this._opt.url = currUrl;
		this._opt.method = (this._opt.method || 'GET').toUpperCase();
	}

	request(params, callback, errCallback, cookie) {
		let self = this;
		let opt = self._opt;

		if (opt.isCookieNeeded === true && cookie === undefined) {
			throw new Error(`This request is cookie needed, you must set a cookie for it before request. id = ${opt.id}`);
		}

		errCallback = typeof errCallback !== 'function'
			? e => console.error(e)
			: errCallback;

		if (opt.status === STATUS_MOCK || opt.status === STATUS_MOCK_ERR) {
			self._mockRequest(params, callback, errCallback);
			return;
		}

		let options = {
			url: opt.url,
			method: opt.method,
			timeout: opt.timeout,
			encoding: null,
			pool: { maxSockets: Infinity }, // http socket连接池设置为无穷大
			headers: {}
		};

		if (options.method === 'POST') {
			options.form = params;
		} else {
			options.qs = params;
		}

		if (cookie) {
			options.headers.Cookie = cookie;
		}

		request(options, (error, response, body) => {
			if (error) {
				return errCallback(new Error(`Request service error,url:${options.url};params:${querystring.stringify(params)};isConnect:${error.connect};error:${error.stack}`));
			}

			if (opt.encoding === ENCODING_RAW) {
				return callback(body);
			}

			body = iconv.fromEncoding(body, opt.encoding);

			if (opt.dataType.toLowerCase() === 'json') {
				try {
					body = JSON.parse(body);
				} catch (error) {
					return errCallback(new Error(`request return value parse json fail,url:${options.url};params:${querystring.stringify(params)};returnValue:${body}; error:${error.stack}`));
				}
			}

			callback(body, response.headers['set-cookie']);
		});
	}

	getOption(name) {
		return this._opt[name];
	}

	_mockRequest(params, callback, errCallback) {
		try {
			let engine = Proxy.getMockEngine();
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

	/**
	 * use
	 * @param {InterfaceManager} ifmgr
	 * @throws errors
	 */
	static use(ifmgr) {

		if (ifmgr instanceof InterfacefManager) {
			interfaceManager = ifmgr;
		} else {
			throw new Error('Proxy can only use instance of InterfacefManager!');
		}

		this._engineName = interfaceManager.getEngine();

		return this;
	}

	static getMockEngine() {
		if (this._mockEngine) {
			return this._mockEngine;
		}
		return (this._mockEngine = require(this._engineName));
	}

	static getInterfaceIdsByPrefix(pattern) {
		return interfaceManager.getInterfaceIdsByPrefix(pattern);
	}

	static getRule(interfaceId) {
		return interfaceManager.getRule(interfaceId);
	}

	// Proxy factory
	static create(interfaceId) {
		if (objects[interfaceId]) {
			return objects[interfaceId];
		}
		let opt = interfaceManager.getProfile(interfaceId);
		if (!opt) {
			throw new Error(`Invalid interface id: ${interfaceId}`);
		}
		return (objects[interfaceId] = new this(opt));
	}
}

module.exports = Proxy;

